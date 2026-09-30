import os from "os"

const ATTEMPT_TIMEOUT_MS = 2000
const RETRY_DELAY_MS = 250

export type StateChange = { readonly healthy: boolean }
export type DeliveryResult = { readonly attempts: 1 | 2 }
type DeliveryAttempt = { readonly ok: true } | { readonly ok: false; readonly error: Error }

export type Options = {
  readonly send: (endpoint: string, item: unknown, signal: AbortSignal) => Promise<void>
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly onStateChange?: (change: StateChange) => void | Promise<void>
}

export type Transport = {
  readonly deliver: (endpoint: string, item: unknown) => Promise<DeliveryResult>
}

export function create(options: Options): Transport {
  let healthy = true
  const settle = (next: boolean) => {
    if (healthy === next) return
    healthy = next
    void Promise.resolve()
      .then(() => options.onStateChange?.({ healthy }))
      .then(undefined, () => undefined)
  }
  const attempt = (endpoint: string, item: unknown): Promise<DeliveryAttempt> =>
    options.send(endpoint, item, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)).then(
      () => ({ ok: true }),
      (error: unknown) => ({ ok: false, error: normalizeError(error) }),
    )

  return {
    async deliver(endpoint, item) {
      const first = await attempt(endpoint, item)
      if (first.ok) {
        settle(true)
        return { attempts: 1 }
      }
      await (options.sleep ?? Bun.sleep)(RETRY_DELAY_MS).then(undefined, () => undefined)
      const second = await attempt(endpoint, item)
      if (second.ok) {
        settle(true)
        return { attempts: 2 }
      }
      settle(false)
      throw second.error
    },
  }
}

function localIP() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const alias of iface ?? []) {
      if (alias.family === "IPv4" && !alias.internal) return alias.address
    }
  }
  return "127.0.0.1"
}

export function timestamp() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00")
}

function envelope(item: unknown) {
  return {
    user_id: localIP(),
    ts: timestamp(),
    command: JSON.stringify(item),
  }
}

export async function remoteWrite(endpoint: string, item: unknown, signal?: AbortSignal) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope(item)),
    signal,
  })
  if (response.ok) return
  throw new ComplianceTransportError(response.status, response.statusText)
}

class ComplianceTransportError extends Error {
  override readonly name = "ComplianceTransportError"

  constructor(readonly status: number, readonly statusText: string) {
    super(`컴플라이언스 로그 전송 실패 (${status} ${statusText}). 문제가 지속되면 유관부서에 문의하세요.`)
  }
}

class ComplianceTransportUnknownError extends Error {
  override readonly name = "ComplianceTransportUnknownError"

  constructor() {
    super("컴플라이언스 로그 전송 실패. 문제가 지속되면 유관부서에 문의하세요.")
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error
  return new ComplianceTransportUnknownError()
}

export * as ComplianceTransport from "./transport"
