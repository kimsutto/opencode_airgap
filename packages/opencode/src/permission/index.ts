import { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"
import { InstanceState } from "@/effect/instance-state"
import * as Log from "@opencode-ai/core/util/log"
import { Wildcard } from "@opencode-ai/core/util/wildcard"
import { Deferred, Effect, Layer, Context } from "effect"
import os from "os"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import bashAllowlist from "./bash-allowlist.json"
import toolPolicy from "./tool-policy.json"

const log = Log.create({ service: "permission" })

/**
 * Air-gapped security policy for the bash/shell tool.
 *
 * Shell commands are governed SOLELY by the hardcoded allowlist in
 * ./bash-allowlist.json, independent of config rules or session ("always")
 * approvals. The allowlist has tiers of wildcard patterns matched against
 * each parsed sub-command:
 *   - `allow`:   runs without prompting (keep these narrow/exact).
 *   - `ask`:     prompts every time (cross-platform / POSIX command names).
 *   - `windows`: extra `ask` patterns merged in ONLY on Windows (cmd /
 *                PowerShell command names). See README "Mac, Window 각각
 *                command rules".
 * Anything matching neither tier is denied. `allow` wins over `ask` on overlap.
 *
 * Config rules and saved approvals are never consulted for bash, so neither a
 * higher-level option nor a once-off session approval can override this — an
 * `ask` command keeps prompting on every invocation and is never escalated to
 * `allow`. Edit ONLY bash-allowlist.json to change policy.
 *
 * The permission key is the literal "bash" (== ShellID.ToolID); kept as a
 * string here to avoid importing the tool layer into the permission layer. A
 * contract test asserts it stays equal to ShellID.ToolID, so an upstream rename
 * (see tool/shell/id.ts "Rename with opencode 2.0") trips the test suite.
 */
export const BASH_PERMISSION = "bash"

type BashAllowlist = { allow: ReadonlyArray<string>; ask: ReadonlyArray<string> }
type BashAllowlistFile = BashAllowlist & { windows?: ReadonlyArray<string> }

// Flatten the platform-aware file into the {allow, ask} shape `bashAction`
// consumes: on Windows the `windows` patterns are appended to `ask`, elsewhere
// they are ignored. Computed once at load against the running platform.
const BASH_ALLOWLIST_FILE = bashAllowlist as BashAllowlistFile
const BASH_ALLOWLIST: BashAllowlist = {
  allow: BASH_ALLOWLIST_FILE.allow,
  ask:
    process.platform === "win32"
      ? [...BASH_ALLOWLIST_FILE.ask, ...(BASH_ALLOWLIST_FILE.windows ?? [])]
      : BASH_ALLOWLIST_FILE.ask,
}

/**
 * Air-gapped policy for non-bash built-in tools, hardcoded in ./tool-policy.json
 * and likewise immune to config/approvals. Maps a permission key to a forced
 * action (e.g. websearch -> deny). Keys absent here fall through to the normal
 * config-driven evaluation. `interactive_bash` may not exist in this build but
 * is denied pre-emptively so a future upstream addition is locked down on
 * arrival. Edit ONLY tool-policy.json to change policy.
 */
const TOOL_POLICY = toolPolicy as Readonly<Record<string, PermissionV1.Action>>

/** Resolve the hardcoded effect for a single parsed bash sub-command. */
export function bashAction(command: string, allowlist: BashAllowlist = BASH_ALLOWLIST): PermissionV1.Action {
  if (allowlist.allow.some((pattern) => Wildcard.match(command, pattern))) return "allow"
  if (allowlist.ask.some((pattern) => Wildcard.match(command, pattern))) return "ask"
  return "deny"
}

/**
 * The hardcoded air-gap action for a permission/pattern, or `undefined` when no
 * hardcoded policy applies and normal config evaluation should run. Bash uses
 * the allowlist; other keys use the flat tool-policy map.
 */
export function hardcodedAction(permission: string, command: string): PermissionV1.Action | undefined {
  if (permission === BASH_PERMISSION) return bashAction(command)
  return TOOL_POLICY[permission]
}

export const Event = {
  Asked: EventV2.define({ type: "permission.asked", schema: PermissionV1.Request.fields }),
  Replied: EventV2.define({
    type: "permission.replied",
    schema: {
      sessionID: PermissionV1.Request.fields.sessionID,
      requestID: PermissionV1.ID,
      reply: PermissionV1.Reply,
    },
  }),
}

export interface Interface {
  readonly ask: (input: PermissionV1.AskInput) => Effect.Effect<void, PermissionV1.Error>
  readonly reply: (input: PermissionV1.ReplyInput) => Effect.Effect<void, PermissionV1.NotFoundError>
  readonly list: () => Effect.Effect<ReadonlyArray<PermissionV1.Request>>
}

interface PendingEntry {
  info: PermissionV1.Request
  deferred: Deferred.Deferred<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>
}

interface State {
  pending: Map<PermissionV1.ID, PendingEntry>
  approved: PermissionV1.Rule[]
}

export function evaluate(permission: string, pattern: string, ...rulesets: PermissionV1.Ruleset[]): PermissionV1.Rule {
  return (
    rulesets
      .flat()
      .findLast((rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern)) ?? {
      action: "ask",
      permission,
      pattern: "*",
    }
  )
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Permission") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const state = yield* InstanceState.make<State>(
      Effect.fn("Permission.state")(function* (ctx) {
        void ctx
        const state = {
          pending: new Map<PermissionV1.ID, PendingEntry>(),
          approved: [],
        }

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            for (const item of state.pending.values()) {
              yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
            }
            state.pending.clear()
          }),
        )

        return state
      }),
    )

    const ask = Effect.fn("Permission.ask")(function* (input: PermissionV1.AskInput) {
      const { approved, pending } = yield* InstanceState.get(state)
      const { ruleset, ...request } = input
      let needsAsk = false

      for (const pattern of request.patterns) {
        // Bash and the hardcoded tool-policy keys bypass config/approved rules
        // entirely (air-gap), so these policies cannot be overridden. Everything
        // else falls through to normal config-driven evaluation.
        const forced = hardcodedAction(request.permission, pattern)
        const rule: PermissionV1.Rule = forced
          ? { permission: request.permission, pattern: "*", action: forced }
          : evaluate(request.permission, pattern, ruleset, approved)
        log.info("evaluated", { permission: request.permission, pattern, action: rule })
        if (rule.action === "deny") {
          return yield* new PermissionV1.DeniedError({
            ruleset: ruleset.filter((rule) => Wildcard.match(request.permission, rule.permission)),
          })
        }
        if (rule.action === "allow") continue
        needsAsk = true
      }

      if (!needsAsk) return

      const id = request.id ?? PermissionV1.ID.ascending()
      const info: PermissionV1.Request = {
        id,
        sessionID: request.sessionID,
        permission: request.permission,
        patterns: request.patterns,
        metadata: request.metadata,
        always: request.always,
        tool: request.tool,
      }
      log.info("asking", { id, permission: info.permission, patterns: info.patterns })

      const deferred = yield* Deferred.make<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>()
      pending.set(id, { info, deferred })
      yield* events.publish(Event.Asked, info)
      return yield* Effect.ensuring(
        Deferred.await(deferred),
        Effect.sync(() => {
          pending.delete(id)
        }),
      )
    })

    const reply = Effect.fn("Permission.reply")(function* (input: PermissionV1.ReplyInput) {
      const { approved, pending } = yield* InstanceState.get(state)
      const existing = pending.get(input.requestID)
      if (!existing) return yield* new PermissionV1.NotFoundError({ requestID: input.requestID })

      pending.delete(input.requestID)
      yield* events.publish(Event.Replied, {
        sessionID: existing.info.sessionID,
        requestID: existing.info.id,
        reply: input.reply,
      })

      if (input.reply === "reject") {
        yield* Deferred.fail(
          existing.deferred,
          input.message
            ? new PermissionV1.CorrectedError({ feedback: input.message })
            : new PermissionV1.RejectedError(),
        )

        for (const [id, item] of pending.entries()) {
          if (item.info.sessionID !== existing.info.sessionID) continue
          pending.delete(id)
          yield* events.publish(Event.Replied, {
            sessionID: item.info.sessionID,
            requestID: item.info.id,
            reply: "reject",
          })
          yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
        }
        return
      }

      yield* Deferred.succeed(existing.deferred, undefined)
      if (input.reply === "once") return

      for (const pattern of existing.info.always) {
        approved.push({
          permission: existing.info.permission,
          pattern,
          action: "allow",
        })
      }

      for (const [id, item] of pending.entries()) {
        if (item.info.sessionID !== existing.info.sessionID) continue
        const ok = item.info.patterns.every(
          (pattern) => evaluate(item.info.permission, pattern, approved).action === "allow",
        )
        if (!ok) continue
        pending.delete(id)
        yield* events.publish(Event.Replied, {
          sessionID: item.info.sessionID,
          requestID: item.info.id,
          reply: "always",
        })
        yield* Deferred.succeed(item.deferred, undefined)
      }
    })

    const list = Effect.fn("Permission.list")(function* () {
      const pending = (yield* InstanceState.get(state)).pending
      return Array.from(pending.values(), (item) => item.info)
    })

    return Service.of({ ask, reply, list })
  }),
)

function expand(pattern: string): string {
  if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1)
  if (pattern === "~") return os.homedir()
  if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5)
  if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5)
  return pattern
}

export function fromConfig(permission: ConfigPermissionV1.Info) {
  const ruleset: PermissionV1.Rule[] = []
  for (const [key, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      ruleset.push({ permission: key, action: value, pattern: "*" })
      continue
    }
    ruleset.push(
      ...Object.entries(value).map(([pattern, action]) => ({ permission: key, pattern: expand(pattern), action })),
    )
  }
  return ruleset
}

export function merge(...rulesets: PermissionV1.Ruleset[]): PermissionV1.Rule[] {
  return rulesets.flat()
}

export function disabled(tools: string[], ruleset: PermissionV1.Ruleset): Set<string> {
  const edits = ["edit", "write", "apply_patch"]
  return new Set(
    tools.filter((tool) => {
      const permission = edits.includes(tool) ? "edit" : tool
      const rule = ruleset.findLast((rule) => Wildcard.match(permission, rule.permission))
      return rule?.pattern === "*" && rule.action === "deny"
    }),
  )
}

export const defaultLayer = layer.pipe(Layer.provide(EventV2Bridge.defaultLayer))

export * as Permission from "."
