# opencode database guide

## 사내 포크 경계

- `src/permission/AGENTS.md`는 사용자가 덮어쓸 수 없는 bash 및 내장 도구 정책을 다룬다. 정책 JSON은 일반 사용자 설정이 아니라 보안에 민감한 소스다.
- `src/compliance/AGENTS.md`는 로컬·원격 감사 동작을 다룬다. endpoint는 `@opencode-ai/core` 설정, 플러그인 부트스트랩, `script/build.ts`의 컴파일 타임 주입 경로에 걸쳐 있다.
- `src/mcp/index.ts`는 의도적으로 MCP를 두 번 차단한다. 시작 전에 설정된 서버를 버리고, `tools()`가 모델에 노출할 빈 레지스트리를 반환한다. upstream 병합 시 두 방어선을 모두 보존한다.
- 한국어 개인정보 고지는 `@opencode-ai/tui`의 `packages/tui/src/routes/home.tsx`에 있다. 정책 집행을 UI로 옮기지 않는다.
- 이 통제는 완전한 네트워크 샌드박스가 아니다. 배포 환경의 송신, 업데이트 기능, provider, auth 플러그인, `webfetch`, 승인된 셸 명령까지 통제하지 않았다면 바이너리를 완전한 폐쇄망 제품이라고 설명하지 않는다.

## 포크 검증

- 이 패키지에서 권한 정책 테스트를 실행한다: `bun test test/permission/bash-allowlist.test.ts test/permission/next.test.ts`.
- opencode TypeScript를 변경한 뒤 이 디렉터리에서 `bun typecheck`를 실행한다.
- 컴플라이언스와 MCP에는 현재 전용 자동화 테스트가 없다. 해당 경계를 변경하면 실제 동작을 직접 검증하고 가능한 경우 테스트를 추가한다.

## Database

- **Schema**: Drizzle schema lives in `packages/core/src/**/*.sql.ts`.
- **Migrations**: database migrations live in `packages/core` and are applied by core.

## Development server

- Running `bun dev` from `packages/opencode` starts the live interactive TUI. Do not run it as a blocking foreground command when you need to inspect the result.
- Start it in `tmux` instead: `tmux new-session -d -s opencode-dev 'bun dev'`.
- Capture the current TUI output with: `tmux capture-pane -pt opencode-dev`.
- Stop the session explicitly when done: `tmux kill-session -t opencode-dev`.

# Module shape

Do not use `export namespace Foo { ... }` for module organization. It is not
standard ESM, it prevents tree-shaking, and it breaks Node's native TypeScript
runner. Use flat top-level exports combined with a self-reexport at the bottom
of the file:

```ts
// src/foo/foo.ts
export interface Interface { ... }
export class Service extends Context.Service<Service, Interface>()("@opencode/Foo") {}
export const layer = Layer.effect(Service, ...)
export const defaultLayer = layer.pipe(...)

export * as Foo from "./foo"
```

Consumers import the namespace projection:

```ts
import { Foo } from "@/foo/foo"

yield * Foo.Service
Foo.layer
Foo.defaultLayer
```

Namespace-private helpers stay as non-exported top-level declarations in the
same file — they remain inaccessible to consumers (they are not projected by
`export * as`) but are usable by the file's own code.

## When the file is an `index.ts`

If the module is `foo/index.ts` (single-namespace directory), use `"."` for
the self-reexport source rather than `"./index"`:

```ts
// src/foo/index.ts
export const thing = ...

export * as Foo from "."
```

## Multi-sibling directories

For directories with several independent modules (e.g. `src/session/`,
`src/config/`), keep each sibling as its own file with its own self-reexport,
and do not add a barrel `index.ts`. Consumers import the specific sibling:

```ts
import { SessionRetry } from "@/session/retry"
import { SessionStatus } from "@/session/status"
```

Barrels in multi-sibling directories force every import through the barrel to
evaluate every sibling, which defeats tree-shaking and slows module load.

# opencode Effect rules

Use these rules when writing or migrating Effect code.

See `specs/effect/migration.md` for the compact pattern reference and examples.

## Core

- Use `Effect.gen(function* () { ... })` for composition.
- Use `Effect.fn("Domain.method")` for named/traced effects and `Effect.fnUntraced` for internal helpers.
- `Effect.fn` / `Effect.fnUntraced` accept pipeable operators as extra arguments, so avoid unnecessary outer `.pipe()` wrappers.
- Use `Effect.callback` for callback-based APIs.
- Use `Effect.void` instead of `Effect.succeed(undefined)` or `Effect.succeed(void 0)`.
- Prefer `DateTime.nowAsDate` over `new Date(yield* Clock.currentTimeMillis)` when you need a `Date`.

## Module conventions

- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.

## Schemas and errors

- Use `Schema.Class` for multi-field data.
- Use branded schemas (`Schema.brand`) for single-value types.
- Use `Schema.TaggedErrorClass` for typed errors.
- Use `Schema.Defect` instead of `unknown` for defect-like causes.
- In `Effect.gen` / `Effect.fn`, prefer `yield* new MyError(...)` over `yield* Effect.fail(new MyError(...))` for direct early-failure branches.

## Runtime vs InstanceState

- Use `makeRuntime` (from `src/effect/run-service.ts`) for all services. It returns `{ runPromise, runFork, runCallback }` backed by a shared `memoMap` that deduplicates layers.
- Use `InstanceState` (from `src/effect/instance-state.ts`) for per-directory or per-project state that needs per-instance cleanup. It uses `ScopedCache` keyed by directory — each open project gets its own state, automatically cleaned up on disposal.
- If two open directories should not share one copy of the service, it needs `InstanceState`.
- Do the work directly in the `InstanceState.make` closure — `ScopedCache` handles run-once semantics. Don't add fibers, `ensure()` callbacks, or `started` flags on top.
- Use `Effect.addFinalizer` or `Effect.acquireRelease` inside the `InstanceState.make` closure for cleanup (subscriptions, process teardown, etc.).
- Use `Effect.forkScoped` inside the closure for background stream consumers — the fiber is interrupted when the instance is disposed.
- To make a service's `init()` non-blocking, fork `InstanceState.get(state)` at the `init()` call site (e.g. `Effect.forkIn(scope)`), not by forking work inside the `InstanceState.make` closure. Forking inside the closure leaves state incomplete for other methods that read it.
- `src/project/bootstrap.ts` already wraps every service `init()` in `Effect.forkDetach`, so `init()` is fire-and-forget in production. Keep `init()` methods synchronous internally; the caller controls concurrency.

## Effect v4 beta API

- `Effect.fork` and `Effect.forkDaemon` do not exist. Use `Effect.forkIn(scope)` to fork a fiber into a specific scope.

## Preferred Effect services

- In effectified services, prefer yielding existing Effect services over dropping down to ad hoc platform APIs.
- Prefer `FileSystem.FileSystem` instead of raw `fs/promises` for effectful file I/O.
- Prefer `ChildProcessSpawner.ChildProcessSpawner` with `ChildProcess.make(...)` instead of custom process wrappers.
- Prefer `HttpClient.HttpClient` instead of raw `fetch`.
- Prefer `Path.Path`, `Config`, `Clock`, and `DateTime` when those concerns are already inside Effect code.
- For background loops or scheduled tasks, use `Effect.repeat` or `Effect.schedule` with `Effect.forkScoped` in the layer definition.

## Effect.cached for deduplication

Use `Effect.cached` when multiple concurrent callers should share a single in-flight computation rather than storing `Fiber | undefined` or `Promise | undefined` manually. See `specs/effect/migration.md` for the full pattern.

## Callback boundaries

Use `EffectBridge` for native or external callbacks (`@parcel/watcher`, `node-pty`, native `fs.watch`, plugin callbacks, etc.) that need to re-enter Effect services with instance/workspace context.

Plain async code should pass explicit context or stay inside an Effect fiber; do not add ambient instance context shims.
