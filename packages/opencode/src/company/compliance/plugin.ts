import type { Hooks, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import * as Log from "@opencode-ai/core/util/log"
import { Schema } from "effect"
import { ComplianceTransport, remoteWrite, timestamp } from "./transport"

const log = Log.create({ service: "compliance" })
declare const OPENCODE_COMPLIANCE_ENDPOINT: string

export class CompanyPluginStartupError extends Schema.TaggedErrorClass<CompanyPluginStartupError>()(
  "CompanyPluginStartupError",
  {
    plugin: Schema.String,
    cause: Schema.Defect,
  },
) {}

class ComplianceEndpointMissingError extends Error {
  override readonly name = "ComplianceEndpointMissingError"

  constructor() {
    super("컴플라이언스 로그 서버 endpoint가 설정되지 않았습니다.")
  }
}

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function str(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function part(value: unknown) {
  if (!obj(value)) return { type: "unknown" }
  const type = str(value.type) ?? "unknown"
  if (type === "text") return { type, text: str(value.text) ?? "" }
  if (type === "reasoning") return { type, text: str(value.text) ?? "" }
  if (type === "file") {
    return {
      type,
      mime: str(value.mime) ?? str(value.mediaType),
      filename: str(value.filename),
    }
  }
  if (type === "agent") return { type, name: str(value.name) }
  if (type === "subtask") {
    return {
      type,
      agent: str(value.agent),
      description: str(value.description),
      prompt: str(value.prompt),
    }
  }
  return { type }
}

function line(sessionID: string, type: string, data: Record<string, unknown>) {
  return {
    v: 1,
    ts: timestamp(),
    sessionID,
    type,
    data,
  }
}

export async function ComplianceLogPlugin(
  input: Pick<PluginInput, "client" | "directory" | "worktree">,
  options?: PluginOptions,
): Promise<Hooks> {
  const endpoint = OPENCODE_COMPLIANCE_ENDPOINT
  if (!endpoint) throw new ComplianceEndpointMissingError()

  const meta = new Set<string>()

  const toast = (message: string, variant: "success" | "error") => {
    void input.client.tui.showToast({ body: { message, variant, duration: 8000 } }).then(undefined, () => undefined)
  }
  const transport = ComplianceTransport.create({
    send: remoteWrite,
    onStateChange(change) {
      if (!change.healthy) {
        log.warn("remote write failed")
        toast("컴플라이언스 로그 서버 전송에 실패했습니다. 문제가 지속되면 유관부서에 문의하세요.", "error")
        return
      }
      toast("컴플라이언스 로그 서버 전송이 복구되었습니다.", "success")
    },
  })

  const emit = async (sessionID: string, type: string, data: Record<string, unknown>) => {
    await transport.deliver(endpoint, line(sessionID, type, data))
  }

  const boot = async (sessionID: string, data: Record<string, unknown>) => {
    if (meta.has(sessionID)) return
    await emit(sessionID, "session.meta", data)
    meta.add(sessionID)
  }

  return {
    async "chat.message"(ctx, out) {
      const sessionMeta = {
        directory: input.directory,
        worktree: input.worktree,
        agent: ctx.agent,
        model: ctx.model,
        variant: ctx.variant,
      }
      const userMessage = {
        messageID: out.message.id,
        role: "user",
        parts: out.parts.map(part),
      }
      await boot(ctx.sessionID, sessionMeta)
      await emit(ctx.sessionID, "user.message", userMessage)
    },
    async "tool.execute.before"(ctx, out) {
      await boot(ctx.sessionID, {
        directory: input.directory,
        worktree: input.worktree,
      })
      const data = {
        tool: ctx.tool,
        callID: ctx.callID,
        args: obj(out.args) ? out.args : { value: out.args },
      }
      await emit(ctx.sessionID, "tool.call.request", data)
    },
    async "tool.execute.after"(ctx, out) {
      await boot(ctx.sessionID, {
        directory: input.directory,
        worktree: input.worktree,
      })
      // args is intentionally omitted here: the same args are already recorded
      // in the matching tool.call.request event (correlate via callID).
      const data = {
        tool: ctx.tool,
        callID: ctx.callID,
        title: out.title,
        output: out.output,
        metadata: obj(out.metadata) ? out.metadata : {},
      }
      await emit(ctx.sessionID, "tool.call.output", data)
    },
    async event(inputEvent) {
      const event = inputEvent.event as { type: string; properties: unknown }
      const props = obj(event.properties) ? event.properties : undefined
      if (!props) return Promise.resolve()

      if (event.type === "session.created" || event.type === "session.updated") {
        const sessionID = str(props.sessionID)
        const info = obj(props.info) ? props.info : undefined
        if (!sessionID || !info) return Promise.resolve()
        await boot(sessionID, {
          title: str(info.title),
          directory: str(info.directory) ?? input.directory,
          worktree: input.worktree,
          parentID: str(info.parentID),
        })
        return
      }

      if (event.type === "permission.asked") {
        const sessionID = str(props.sessionID)
        if (!sessionID) return Promise.resolve()
        await boot(sessionID, {
          directory: input.directory,
          worktree: input.worktree,
        })
        const tool = obj(props.tool) ? props.tool : undefined
        const permAskedData = {
          requestID: str(props.id),
          permission: str(props.permission),
          patterns: Array.isArray(props.patterns) ? props.patterns : [],
          metadata: obj(props.metadata) ? props.metadata : {},
          tool: tool
            ? {
                messageID: str(tool.messageID),
                callID: str(tool.callID),
              }
            : undefined,
        }
        await emit(sessionID, "permission.asked", permAskedData)
        return Promise.resolve()
      }

      if (event.type === "permission.replied") {
        const sessionID = str(props.sessionID)
        if (!sessionID) return Promise.resolve()
        const permRepliedData = {
          requestID: str(props.requestID),
          reply: str(props.reply),
        }
        await emit(sessionID, "permission.replied", permRepliedData)
        return Promise.resolve()
      }

      return Promise.resolve()
    },
  }
}

export * as CompanyPlugin from "./plugin"
