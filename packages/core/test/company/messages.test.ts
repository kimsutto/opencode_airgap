import { expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionMessageTable, SessionTable } from "@opencode/core/session/sql"
import { CompanyAudit } from "@opencode/core/company/audit"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(Database.node))
it.effect("audit pairs a persisted response with its preceding prompt, excluding later steering", () =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const sessionID = Session.ID.create()
    const responseID = SessionMessage.ID.create()
    yield* database.db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .run()
    yield* database.db
      .insert(SessionTable)
      .values({ id: sessionID, project_id: Project.ID.global, slug: "audit", directory: "/project", version: "test" })
      .run()
    yield* database.db
      .insert(SessionMessageTable)
      .values([
        {
          id: SessionMessage.ID.create(),
          session_id: sessionID,
          seq: 1,
          type: "user",
          data: { text: "original prompt", time: { created: 1 } },
        },
        {
          id: responseID,
          session_id: sessionID,
          seq: 2,
          type: "assistant",
          data: {
            agent: "build",
            model: { providerID: "test", id: "test" },
            content: [{ type: "text", text: "answer" }],
            time: { created: 2, completed: 3 },
          },
        },
        {
          id: SessionMessage.ID.create(),
          session_id: sessionID,
          seq: 3,
          type: "user",
          data: { text: "later steering", time: { created: 4 } },
        },
      ])
      .run()
    const pair = yield* CompanyAudit.readPair(database, sessionID, responseID)
    expect(pair.prompt).toMatchObject({ type: "user", text: "original prompt" })
    expect(pair.response).toMatchObject({
      type: "assistant",
      id: responseID,
      content: [{ type: "text", text: "answer" }],
    })
  }),
)
