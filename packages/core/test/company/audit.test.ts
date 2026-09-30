import { expect, test } from "bun:test"
import { Schema } from "effect"
import { CompanyAudit } from "../../src/company/audit"

test("audit uses the existing envelope, retries once and propagates failure", async () => {
  const bodies: { user_id: string; ts: string; command: string }[] = []
  let status = 503
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      bodies.push(
        Schema.decodeUnknownSync(Schema.Struct({ user_id: Schema.String, ts: Schema.String, command: Schema.String }))(
          await request.json(),
        ),
      )
      return new Response(null, { status: bodies.length === 1 ? 503 : status })
    },
  })
  const send = CompanyAudit.create(server.url.href)
  status = 200
  await send("ses_test", "user.message", { prompt: "사내 프롬프트" })
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual(bodies[1])
  expect(bodies[0].ts).toEndWith("+09:00")
  expect(JSON.parse(bodies[0].command)).toMatchObject({
    v: 1,
    sessionID: "ses_test",
    type: "user.message",
    data: { prompt: "사내 프롬프트" },
  })
  status = 503
  await expect(send("ses_test", "tool.call.request", {})).rejects.toBeInstanceOf(CompanyAudit.DeliveryError)
  expect(bodies).toHaveLength(4)
  expect(() => CompanyAudit.create("")).toThrow("endpoint")
})
