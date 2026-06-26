import type { Hooks, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import * as Log from "@opencode-ai/core/util/log"
import { write, remoteWrite, timestamp } from "./writer"

const log = Log.create({ service: "compliance" })

declare global {
  // Injected at build time from `.env` (OPENCODE_COMPLIANCE_ENDPOINT) via Bun's `define`.
  // Undefined in local/dev builds where no value is provided.
  const OPENCODE_COMPLIANCE_ENDPOINT: string
}

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function str(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function num(value: unknown) {
  return typeof value === "number" ? value : undefined
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

export async function ComplianceLogPlugin(input: PluginInput, options?: PluginOptions): Promise<Hooks> {
  const compliance = options?.compliance as { endpoint?: string } | undefined
  // Built-in default so the compliance endpoint always applies in release builds,
  // regardless of where opencode is run. Config `compliance.endpoint` can override it.
  // The value is baked in at build time from `.env` (OPENCODE_COMPLIANCE_ENDPOINT) and is
  // empty in local/dev builds, in which case remote logging is disabled.
  const DEFAULT_ENDPOINT = typeof OPENCODE_COMPLIANCE_ENDPOINT === "string" ? OPENCODE_COMPLIANCE_ENDPOINT : ""
  const endpoint = compliance?.endpoint ?? DEFAULT_ENDPOINT

  const meta = new Set<string>()
  const parts = new Set<string>()
  const msgs = new Map<string, { agent?: string; model?: { providerID: string; modelID: string } }>()

  const emit = (sessionID: string, type: string, data: Record<string, unknown>) => {
    try {
      write(input.directory, sessionID, line(sessionID, type, data))
    } catch (error) {
      log.warn("write failed", { error, sessionID, type })
    }
  }

  // Track remote delivery health so the TUI user is notified on state change only.
  // Toasting on every failed event would flood the UI when the server is down,
  // since a single session emits many events.
  let remoteHealthy = true
  const toast = (message: string, variant: "success" | "error") => {
    input.client.tui.showToast({ body: { message, variant, duration: 8000 } }).catch(() => {})
  }
  const onRemoteResult = (sessionID: string, type: string, error?: unknown) => {
    if (!error) {
      if (!remoteHealthy) {
        remoteHealthy = true
        toast("컴플라이언스 로그 서버 전송이 복구되었습니다.", "success")
      }
      return
    }
    log.warn("remote write failed", { error, sessionID, type })
    if (remoteHealthy) {
      remoteHealthy = false
      toast("컴플라이언스 로그 서버 전송에 실패했습니다. 로컬에는 계속 기록됩니다. 문제가 지속되면 유관부서에 문의하세요.", "error")
    }
  }

  const emitRemote = (sessionID: string, type: string, data: Record<string, unknown>) => {
    if (!endpoint) return
    remoteWrite(endpoint, line(sessionID, type, data)).then(
      () => onRemoteResult(sessionID, type),
      (error) => onRemoteResult(sessionID, type, error),
    )
  }

  const emitRemoteBlocking = async (sessionID: string, type: string, data: Record<string, unknown>) => {
    if (!endpoint) return
    try {
      await remoteWrite(endpoint, line(sessionID, type, data))
      onRemoteResult(sessionID, type)
    } catch (error) {
      // Fail open: a failed remote compliance write must not block chat. The full
      // event is still recorded locally via emit(); only remote delivery is lost.
      onRemoteResult(sessionID, type, error)
    }
  }

  const boot = (sessionID: string, data: Record<string, unknown>) => {
    if (meta.has(sessionID)) return
    meta.add(sessionID)
    emit(sessionID, "session.meta", data)
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
      boot(ctx.sessionID, sessionMeta)
      emit(ctx.sessionID, "user.message", userMessage)
      await emitRemoteBlocking(ctx.sessionID, "user.message", userMessage)
    },
    "tool.execute.before"(ctx, out) {
      boot(ctx.sessionID, {
        directory: input.directory,
        worktree: input.worktree,
      })
      const data = {
        tool: ctx.tool,
        callID: ctx.callID,
        args: obj(out.args) ? out.args : { value: out.args },
      }
      emit(ctx.sessionID, "tool.call.request", data)
      emitRemote(ctx.sessionID, "tool.call.request", data)
      return Promise.resolve()
    },
    "tool.execute.after"(ctx, out) {
      boot(ctx.sessionID, {
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
      emit(ctx.sessionID, "tool.call.output", data)
      emitRemote(ctx.sessionID, "tool.call.output", data)
      return Promise.resolve()
    },
    event(inputEvent) {
      const event = inputEvent.event as { type: string; properties: unknown }
      const props = obj(event.properties) ? event.properties : undefined
      if (!props) return Promise.resolve()

      if (event.type === "session.created" || event.type === "session.updated") {
        const sessionID = str(props.sessionID)
        const info = obj(props.info) ? props.info : undefined
        if (!sessionID || !info) return Promise.resolve()
        boot(sessionID, {
          title: str(info.title),
          directory: str(info.directory) ?? input.directory,
          worktree: input.worktree,
          parentID: str(info.parentID),
        })
        return Promise.resolve()
      }

      if (event.type === "message.updated") {
        const info = obj(props.info) ? props.info : undefined
        if (!info || str(info.role) !== "assistant") return Promise.resolve()
        const id = str(info.id)
        if (!id) return Promise.resolve()
        msgs.set(id, {
          agent: str(info.agent),
          model: {
            providerID: str(info.providerID) ?? "",
            modelID: str(info.modelID) ?? "",
          },
        })
        return Promise.resolve()
      }

      if (event.type === "message.part.updated") {
        const sessionID = str(props.sessionID)
        const next = obj(props.part) ? props.part : undefined
        if (!sessionID || !next) return Promise.resolve()
        const type = str(next.type)
        if (type !== "text" && type !== "reasoning") return Promise.resolve()
        const text = str(next.text)?.trim()
        const time = obj(next.time) ? next.time : undefined
        const end = num(time?.end)
        const partID = str(next.id)
        const messageID = str(next.messageID)
        if (!text || !end || !partID || !messageID || parts.has(partID)) return Promise.resolve()
        parts.add(partID)
        const msg = msgs.get(messageID)
        const assistantData = {
          messageID,
          partID,
          partType: type,
          text,
          agent: msg?.agent,
          model: msg?.model?.providerID && msg.model.modelID ? msg.model : undefined,
        }
        // assistant.message is intentionally not sent remotely: large generated
        // content; remote audit relies on user.message + tool.call.* instead.
        emit(sessionID, "assistant.message", assistantData)
        return Promise.resolve()
      }

      if (event.type === "permission.asked") {
        const sessionID = str(props.sessionID)
        if (!sessionID) return Promise.resolve()
        boot(sessionID, {
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
        emit(sessionID, "permission.asked", permAskedData)
        emitRemote(sessionID, "permission.asked", permAskedData)
        return Promise.resolve()
      }

      if (event.type === "permission.replied") {
        const sessionID = str(props.sessionID)
        if (!sessionID) return Promise.resolve()
        const permRepliedData = {
          requestID: str(props.requestID),
          reply: str(props.reply),
        }
        emit(sessionID, "permission.replied", permRepliedData)
        emitRemote(sessionID, "permission.replied", permRepliedData)
        return Promise.resolve()
      }

      return Promise.resolve()
    },
  }
}
