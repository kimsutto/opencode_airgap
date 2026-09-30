import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Wildcard } from "@opencode-ai/core/util/wildcard"
import bashAllowlist from "./bash-allowlist.json"
import toolPolicy from "./tool-policy.json"

export const BASH_PERMISSION = "bash"

export type BashAllowlist = {
  readonly allow: readonly string[]
  readonly ask: readonly string[]
}

type BashAllowlistFile = BashAllowlist & {
  readonly windowsAllow?: readonly string[]
  readonly windowsAsk?: readonly string[]
}

class InvalidCompanyPolicyError extends Error {
  override readonly name = "InvalidCompanyPolicyError"

  constructor(readonly action: string) {
    super(`지원하지 않는 회사 권한 정책입니다: ${action}`)
  }
}

const BASH_ALLOWLIST_FILE: BashAllowlistFile = bashAllowlist
const BASH_ALLOWLIST: BashAllowlist =
  process.platform === "win32"
    ? {
        allow: [...BASH_ALLOWLIST_FILE.allow, ...(BASH_ALLOWLIST_FILE.windowsAllow ?? [])],
        ask: [...BASH_ALLOWLIST_FILE.ask, ...(BASH_ALLOWLIST_FILE.windowsAsk ?? [])],
      }
    : {
        allow: BASH_ALLOWLIST_FILE.allow,
        ask: BASH_ALLOWLIST_FILE.ask,
      }
const TOOL_POLICY = Object.fromEntries(
  Object.entries(toolPolicy).map(([permission, action]) => [permission, policyAction(action)]),
)

export function bashAction(command: string, allowlist: BashAllowlist = BASH_ALLOWLIST): PermissionV1.Action {
  if (allowlist.allow.some((pattern) => Wildcard.match(command, pattern))) return "allow"
  if (allowlist.ask.some((pattern) => Wildcard.match(command, pattern))) return "ask"
  return "deny"
}

export function hardcodedAction(permission: string, command: string): PermissionV1.Action | undefined {
  if (permission === BASH_PERMISSION) return bashAction(command)
  return TOOL_POLICY[permission]
}

function policyAction(action: string): PermissionV1.Action {
  if (action === "allow" || action === "ask" || action === "deny") return action
  throw new InvalidCompanyPolicyError(action)
}

export * as CompanyPolicy from "./policy"
