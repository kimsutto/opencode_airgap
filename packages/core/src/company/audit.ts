export * as CompanyAudit from "./audit.js"

import os from "node:os"
import { and, desc, eq, lt } from "drizzle-orm"
import { Effect } from "effect"
import type { Session } from "@opencode/schema/session"
import type { SessionMessage } from "@opencode/schema/session-message"
import { Database } from "../database/database.js"
import { SessionMessageTable } from "../session/sql.js"
import { SessionHistory } from "../session/history.js"

declare const OPENCODE_COMPLIANCE_ENDPOINT: string

export class DeliveryError extends Error {
  override readonly name = "CompanyAuditDeliveryError"
  constructor() {
    super("컴플라이언스 로그 전송 실패. 로그 서버 설정과 연결을 확인해 주세요.")
  }
}

export function create(endpoint: string) {
  if (!endpoint) throw new Error("컴플라이언스 로그 서버 endpoint가 설정되지 않았습니다.")
  const url = new URL(endpoint)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("잘못된 컴플라이언스 서버 프로토콜입니다.")
  return async (sessionID: string, type: string, data: unknown) => {
    const ts = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("Z", "+09:00")
    const body = JSON.stringify({
      user_id:
        Object.values(os.networkInterfaces())
          .flat()
          .find((ip) => ip?.family === "IPv4" && !ip.internal)?.address ?? "127.0.0.1",
      ts,
      command: JSON.stringify({ v: 1, ts, sessionID, type, data }),
    })
    const send = () =>
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(2000),
        redirect: "error",
      }).then(
        async (response) => {
          await response.body?.cancel()
          return response.ok
        },
        () => false,
      )
    if (await send()) return
    await Bun.sleep(250)
    if (await send()) return
    throw new DeliveryError()
  }
}

// Production builds always define this constant. Unbundled upstream tests have no audit endpoint.
const deliver = typeof OPENCODE_COMPLIANCE_ENDPOINT === "undefined" ? undefined : create(OPENCODE_COMPLIANCE_ENDPOINT)

export const emit = (sessionID: string, type: string, data: unknown) =>
  deliver ? Effect.promise(() => deliver(sessionID, type, data)) : Effect.void

/** Read persisted messages so restart, steering and compaction cannot lose the prompt/response association. */
export const readPair = Effect.fn("CompanyAudit.readPair")(function* (
  database: Database.Interface,
  sessionID: Session.ID,
  messageID: SessionMessage.ID,
) {
  const response = yield* database.db
    .select()
    .from(SessionMessageTable)
    .where(and(eq(SessionMessageTable.session_id, sessionID), eq(SessionMessageTable.id, messageID)))
    .get()
    .pipe(Effect.orDie)
  if (!response) return yield* Effect.die(new Error("컴플라이언스 모델 응답을 찾을 수 없습니다."))
  const prompt = yield* database.db
    .select()
    .from(SessionMessageTable)
    .where(
      and(
        eq(SessionMessageTable.session_id, sessionID),
        eq(SessionMessageTable.type, "user"),
        lt(SessionMessageTable.seq, response.seq),
      ),
    )
    .orderBy(desc(SessionMessageTable.seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  if (!prompt) return yield* Effect.die(new Error("컴플라이언스 사용자 프롬프트를 찾을 수 없습니다."))
  return {
    prompt: yield* SessionHistory.decodeMessageRow(prompt).pipe(Effect.orDie),
    response: yield* SessionHistory.decodeMessageRow(response).pipe(Effect.orDie),
  }
})

export const assistant = (database: Database.Interface, sessionID: Session.ID, messageID: SessionMessage.ID) =>
  deliver
    ? readPair(database, sessionID, messageID).pipe(
        Effect.flatMap((data) => emit(sessionID, "assistant.message", data)),
      )
    : Effect.void
