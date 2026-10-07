import { afterEach, describe, expect, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { ComplianceLogPlugin } from "@/company/compliance/plugin"

const originalEndpoint = Reflect.get(globalThis, "OPENCODE_COMPLIANCE_ENDPOINT")

afterEach(() => {
  if (originalEndpoint === undefined) {
    Reflect.deleteProperty(globalThis, "OPENCODE_COMPLIANCE_ENDPOINT")
    return
  }
  Reflect.set(globalThis, "OPENCODE_COMPLIANCE_ENDPOINT", originalEndpoint)
})

describe("company compliance", () => {
  test.each([
    { label: "normal stop", finish: "stop", error: undefined },
    { label: "output limit", finish: "length", error: undefined },
    { label: "tool handoff", finish: "tool-calls", error: undefined },
    {
      label: "API failure without finish",
      finish: undefined,
      error: {
        name: "APIError",
        data: { message: "Model unavailable", statusCode: 503, isRetryable: true },
      },
    },
    {
      label: "user cancellation without finish",
      finish: undefined,
      error: { name: "MessageAbortedError", data: { message: "Aborted" } },
    },
    {
      label: "context overflow",
      finish: "error",
      error: { name: "ContextOverflowError", data: { message: "Context limit exceeded" } },
    },
  ])("logs completion diagnostics: $label", async ({ finish, error }) => {
    const requests: unknown[] = []
    let messageRequests = 0
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        requests.push(await request.json())
        return new Response(null, { status: 204 })
      },
    })
    Reflect.set(globalThis, "OPENCODE_COMPLIANCE_ENDPOINT", `${server.url}compliance`)

    const client = {
      session: {
        message: async () => {
          messageRequests++
          return {
            data: {
              info: {
                id: "msg_assistant",
                sessionID: "ses_test",
                role: "assistant",
                parentID: "msg_user",
                agent: "build",
                providerID: "openai",
                modelID: "gpt-5",
                finish,
                error: error
                  ? {
                      ...error,
                      data: {
                        ...error.data,
                        responseHeaders: { "set-cookie": "PRIVATE_HEADER" },
                        responseBody: "PRIVATE_BODY",
                        metadata: { token: "PRIVATE_METADATA" },
                      },
                    }
                  : undefined,
                time: { created: 1, completed: 2 },
                tokens: { input: 20, output: 10, reasoning: 3, cache: { read: 4, write: 0 } },
                cost: 0.001,
              },
              parts: [
                {
                  id: "prt_text",
                  sessionID: "ses_test",
                  messageID: "msg_assistant",
                  type: "text",
                  text: "모델 응답",
                },
              ],
            },
          }
        },
      },
      tui: {
        showToast: async () => ({ data: true }),
      },
    } as unknown as PluginInput["client"]

    try {
      const hooks = await ComplianceLogPlugin({
        client,
        directory: "/workspace",
        worktree: "/workspace",
      })
      const chatMessage = hooks["chat.message"]
      await chatMessage?.(
        {
          sessionID: "ses_test",
          agent: "build",
          model: { providerID: "openai", modelID: "gpt-5" },
        },
        {
          message: { id: "msg_user", role: "user" },
          parts: [{ type: "text", text: "사용자 프롬프트" }],
        } as Parameters<NonNullable<typeof chatMessage>>[1],
      )
      await hooks.event?.({
        event: {
          type: "message.updated",
          properties: {
            info: {
              id: "msg_assistant",
              sessionID: "ses_test",
              role: "assistant",
              time: { created: 1 },
              finish,
            },
          },
        },
      } as Parameters<NonNullable<typeof hooks.event>>[0])
      expect(requests).toHaveLength(2)
      expect(messageRequests).toBe(0)
      await hooks.event?.({
        event: {
          type: "message.updated",
          properties: {
            info: {
              id: "msg_assistant",
              sessionID: "ses_test",
              role: "assistant",
              parentID: "msg_user",
              time: { created: 1, completed: 2 },
            },
          },
        },
      } as Parameters<NonNullable<typeof hooks.event>>[0])
      await hooks.event?.({
        event: {
          type: "message.updated",
          properties: {
            info: {
              id: "msg_assistant",
              sessionID: "ses_test",
              role: "assistant",
              parentID: "msg_user",
              time: { created: 1, completed: 2 },
            },
          },
        },
      } as Parameters<NonNullable<typeof hooks.event>>[0])

      expect(requests).toHaveLength(3)
      expect(messageRequests).toBe(1)
      const userEnvelope = requests[1] as { command: string }
      const assistantEnvelope = requests[2] as { command: string }
      expect(JSON.parse(userEnvelope.command)).toMatchObject({
        sessionID: "ses_test",
        type: "user.message",
        data: {
          messageID: "msg_user",
          role: "user",
          parts: [{ type: "text", text: "사용자 프롬프트" }],
        },
      })
      const assistantLog = JSON.parse(assistantEnvelope.command) as {
        sessionID: string
        type: string
        data: unknown
      }
      expect({ sessionID: assistantLog.sessionID, type: assistantLog.type }).toEqual({
        sessionID: "ses_test",
        type: "assistant.message",
      })
      expect(assistantLog.data).toEqual({
        prompt: {
          messageID: "msg_user",
          role: "user",
          parts: [{ type: "text", text: "사용자 프롬프트" }],
        },
        response: {
          messageID: "msg_assistant",
          role: "assistant",
          parentID: "msg_user",
          agent: "build",
          providerID: "openai",
          modelID: "gpt-5",
          ...(finish ? { finish } : {}),
          ...(error ? { error } : {}),
          time: { created: 1, completed: 2 },
          tokens: { input: 20, output: 10, reasoning: 3, cache: { read: 4, write: 0 } },
          cost: 0.001,
          parts: [{ type: "text", text: "모델 응답" }],
        },
      })
      if (error) {
        await hooks.event?.({
          event: {
            type: "session.error",
            properties: {
              sessionID: "ses_before_response",
              error: {
                ...error,
                data: { ...error.data, responseBody: "PRIVATE_BODY" },
              },
            },
          },
        } as Parameters<NonNullable<typeof hooks.event>>[0])
        expect(requests).toHaveLength(4)
        expect(messageRequests).toBe(1)
        expect(JSON.parse((requests[3] as { command: string }).command)).toMatchObject({
          sessionID: "ses_before_response",
          type: "session.error",
          data: { error },
        })
      }
      expect(JSON.stringify(requests)).not.toContain("PRIVATE_")
    } finally {
      server.stop(true)
    }
  })
})
