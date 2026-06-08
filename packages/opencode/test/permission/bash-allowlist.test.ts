import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { test, expect, describe } from "bun:test"
import { Effect, Exit, Cause, Fiber, Layer } from "effect"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { Permission } from "../../src/permission"
import { ShellID } from "../../src/tool/shell/id"
import { InstanceBootstrap } from "../../src/project/bootstrap-service"
import { InstanceStore } from "../../src/project/instance-store"
import { testEffect } from "../lib/effect"
import { SessionID } from "../../src/session/schema"

// ----------------------------------------------------------------------------
// Pure policy (Permission.bashAction) — the air-gapped allowlist decision.
// ----------------------------------------------------------------------------

// Tripwire: the air-gap guard in permission/index.ts keys on BASH_PERMISSION.
// If upstream renames the shell tool's permission key (tool/shell/id.ts notes
// "Rename with opencode 2.0"), this fails so the guard gets updated in lockstep
// instead of being silently bypassed.
describe("bash permission key contract", () => {
  test("guard key equals the shell tool's permission key", () => {
    expect(Permission.BASH_PERMISSION).toBe(ShellID.ToolID)
  })
})

describe("Permission.bashAction (hardcoded air-gap allowlist)", () => {
  test("allowlisted read-only commands resolve to ask", () => {
    expect(Permission.bashAction("ls")).toBe("ask")
    expect(Permission.bashAction("ls -la /tmp")).toBe("ask")
    expect(Permission.bashAction("pwd")).toBe("ask")
    expect(Permission.bashAction("git status")).toBe("ask")
    expect(Permission.bashAction("git diff HEAD~1")).toBe("ask")
  })

  test("listed commands (incl. mutating ones) resolve to ask, never allow", () => {
    // The allowlist intentionally puts everything under `ask` (allow is empty),
    // so even mutating commands prompt every time rather than auto-running.
    expect(Permission.bashAction("rm -rf /")).toBe("ask")
    expect(Permission.bashAction("curl http://example.com")).toBe("ask")
    expect(Permission.bashAction("python script.py")).toBe("ask")
    expect(Permission.bashAction("git push origin main")).toBe("ask")
  })

  test("commands outside the allowlist are denied", () => {
    expect(Permission.bashAction("ssh user@host")).toBe("deny")
    expect(Permission.bashAction("nc -l 1234")).toBe("deny")
    expect(Permission.bashAction("reboot")).toBe("deny")
    expect(Permission.bashAction("")).toBe("deny")
  })

  test("prefix matches do not leak (lsof is not matched by ls *)", () => {
    const list = { allow: [], ask: ["ls *"] }
    expect(Permission.bashAction("lsof", list)).toBe("deny")
  })

  test("allow tier resolves to allow", () => {
    const list = { allow: ["git status", "ls *"], ask: ["git *"] }
    expect(Permission.bashAction("git status", list)).toBe("allow")
    expect(Permission.bashAction("ls -la", list)).toBe("allow")
  })

  test("allow tier wins over an overlapping ask pattern", () => {
    const list = { allow: ["git status"], ask: ["git *"] }
    expect(Permission.bashAction("git status", list)).toBe("allow")
    expect(Permission.bashAction("git push", list)).toBe("ask")
  })

  test("anything outside both tiers is denied", () => {
    const list = { allow: ["git status"], ask: ["git *"] }
    expect(Permission.bashAction("rm -rf /", list)).toBe("deny")
  })
})

// ----------------------------------------------------------------------------
// Pure policy (Permission.hardcodedAction) — bash + the non-bash tool-policy
// (./tool-policy.json) that likewise overrides config.
// ----------------------------------------------------------------------------

describe("Permission.hardcodedAction (air-gap tool policy)", () => {
  test("bash delegates to the allowlist", () => {
    expect(Permission.hardcodedAction("bash", "ls")).toBe("ask")
    expect(Permission.hardcodedAction("bash", "ssh user@host")).toBe("deny")
  })

  test("tool-policy keys are forced", () => {
    expect(Permission.hardcodedAction("webfetch", "*")).toBe("ask")
    expect(Permission.hardcodedAction("websearch", "*")).toBe("deny")
    expect(Permission.hardcodedAction("interactive_bash", "*")).toBe("deny")
  })

  test("keys without a hardcoded policy fall through to config", () => {
    expect(Permission.hardcodedAction("edit", "foo.ts")).toBeUndefined()
    expect(Permission.hardcodedAction("read", "foo.ts")).toBeUndefined()
    expect(Permission.hardcodedAction("some_mcp_tool", "*")).toBeUndefined()
  })
})

// ----------------------------------------------------------------------------
// Integration (Permission.ask) — proves the policy overrides config + approvals.
// ----------------------------------------------------------------------------

const events = EventV2Bridge.defaultLayer
const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const env = Layer.mergeAll(
  Permission.layer.pipe(Layer.provide(Database.defaultLayer), Layer.provide(events)),
  events,
  CrossSpawnSpawner.defaultLayer,
  InstanceStore.defaultLayer.pipe(Layer.provide(noopBootstrap)),
)
const it = testEffect(env)

const ask = (input: Parameters<Permission.Interface["ask"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.ask(input)
  })

const reply = (input: Parameters<Permission.Interface["reply"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.reply(input)
  })

const rejectAll = () =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    for (const req of yield* permission.list()) {
      yield* permission.reply({ requestID: req.id, reply: "reject" })
    }
  })

const waitForPending = (count: number) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* Effect.gen(function* () {
      while (true) {
        const list = yield* permission.list()
        if (list.length === count) return list
        yield* Effect.sleep("10 millis")
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: "1 second",
        orElse: () => Effect.fail(new Error(`timed out waiting for ${count} pending permission request(s)`)),
      }),
    )
  })

const fail = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* self.pipe(Effect.exit)
    if (Exit.isFailure(exit)) return Cause.squash(exit.cause)
    throw new Error("expected permission effect to fail")
  })

it.instance(
  "bash ignores a config allow rule: an allowlisted command still prompts",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: ShellID.ToolID,
        patterns: ["ls"],
        metadata: {},
        always: [],
        // config tries to auto-allow everything — must be ignored for bash
        ruleset: [{ permission: ShellID.ToolID, pattern: "*", action: "allow" }],
      }).pipe(Effect.forkScoped)

      expect(yield* waitForPending(1)).toHaveLength(1)
      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  { git: true },
)

it.instance(
  "bash ignores a config allow rule: a non-allowlisted command is denied",
  () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_test"),
          permission: ShellID.ToolID,
          patterns: ["ssh evil.example"],
          metadata: {},
          always: [],
          ruleset: [{ permission: ShellID.ToolID, pattern: "*", action: "allow" }],
        }),
      )
      expect(err).toBeInstanceOf(PermissionV1.DeniedError)
    }),
  { git: true },
)

it.instance(
  "bash keeps prompting after a session 'always' approval (never escalates to allow)",
  () =>
    Effect.gen(function* () {
      const first = yield* ask({
        id: PermissionV1.ID.make("per_bash_always"),
        sessionID: SessionID.make("session_test"),
        permission: ShellID.ToolID,
        patterns: ["ls"],
        metadata: {},
        always: ["ls *"],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      yield* waitForPending(1)
      yield* reply({ requestID: PermissionV1.ID.make("per_bash_always"), reply: "always" })
      yield* Fiber.join(first)

      // A brand-new invocation of the same command must prompt again.
      const second = yield* ask({
        sessionID: SessionID.make("session_test_2"),
        permission: ShellID.ToolID,
        patterns: ["ls"],
        metadata: {},
        always: [],
        ruleset: [],
      }).pipe(Effect.forkScoped)

      expect(yield* waitForPending(1)).toHaveLength(1)
      yield* rejectAll()
      yield* Fiber.await(second)
    }),
  { git: true },
)

it.instance(
  "bash denies the whole request when any chained sub-command is not allowlisted",
  () =>
    Effect.gen(function* () {
      const err = yield* fail(
        // ShellTool splits compound commands (e.g. `ls && ssh evil`) into one
        // pattern per parsed sub-command, so a denied sub-command denies all.
        ask({
          sessionID: SessionID.make("session_test"),
          permission: ShellID.ToolID,
          patterns: ["ls", "ssh evil.example"],
          metadata: {},
          always: [],
          ruleset: [{ permission: ShellID.ToolID, pattern: "*", action: "allow" }],
        }),
      )
      expect(err).toBeInstanceOf(PermissionV1.DeniedError)
    }),
  { git: true },
)

// ----------------------------------------------------------------------------
// Integration — the non-bash tool policy also overrides config + approvals.
// ----------------------------------------------------------------------------

it.instance(
  "websearch is denied even when config allows it",
  () =>
    Effect.gen(function* () {
      const err = yield* fail(
        ask({
          sessionID: SessionID.make("session_test"),
          permission: "websearch",
          patterns: ["*"],
          metadata: {},
          always: [],
          ruleset: [{ permission: "websearch", pattern: "*", action: "allow" }],
        }),
      )
      expect(err).toBeInstanceOf(PermissionV1.DeniedError)
    }),
  { git: true },
)

it.instance(
  "webfetch keeps prompting even when config allows it",
  () =>
    Effect.gen(function* () {
      const fiber = yield* ask({
        sessionID: SessionID.make("session_test"),
        permission: "webfetch",
        patterns: ["https://example.com"],
        metadata: {},
        always: ["*"],
        ruleset: [{ permission: "webfetch", pattern: "*", action: "allow" }],
      }).pipe(Effect.forkScoped)

      expect(yield* waitForPending(1)).toHaveLength(1)
      yield* rejectAll()
      yield* Fiber.await(fiber)
    }),
  { git: true },
)
