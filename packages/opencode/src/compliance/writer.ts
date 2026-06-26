import fs from "fs"
import path from "path"
import os from "os"

function localIP(): string {
  const interfaces = os.networkInterfaces()
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue
    for (const alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) return alias.address
    }
  }
  return "127.0.0.1"
}

const seen = new Set<string>()

// Current time as an ISO 8601 string in KST (UTC+9), e.g. 2026-06-25T09:51:52.028+09:00.
// Shared so every compliance timestamp (envelope and event) is in Korea time.
export function timestamp(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().replace("Z", "+09:00")
}

export function file(dir: string, sessionID: string) {
  return path.join(dir, ".opencode", "compliance-log", `${sessionID}.jsonl`)
}

// Shared wire format for both local file lines and the remote payload, so the
// local compliance log is recorded with exactly the same schema that is sent
// to the server.
function envelope(item: unknown) {
  return {
    user_id: localIP(),
    ts: timestamp(),
    command: JSON.stringify(item),
  }
}

export function write(dir: string, sessionID: string, item: unknown) {
  const target = file(dir, sessionID)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.appendFileSync(target, JSON.stringify(envelope(item)) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  })
  if (seen.has(target)) return
  seen.add(target)
  fs.chmodSync(target, 0o600)
}

export async function remoteWrite(endpoint: string, item: unknown): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope(item)),
  })
  if (!res.ok) {
    throw new Error(
      `컴플라이언스 로그 전송 실패 (${res.status} ${res.statusText}). 문제가 지속되면 유관부서에 문의하세요.`,
    )
  }
}
