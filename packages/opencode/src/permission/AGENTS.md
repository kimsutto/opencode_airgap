# 폐쇄망 권한 정책

## 개요

이 디렉터리는 회사가 강제하는 도구 정책을 담는다. 정책 대상 권한 키에는 프로젝트 설정이나 세션에 기억된 승인이 적용되지 않는다.

## 찾아볼 위치

| 관심사 | 위치 | 설명 |
|---|---|---|
| 정책 집행 | `index.ts` | `hardcodedAction`이 일반 규칙 평가보다 먼저 실행된다 |
| 셸 정책 | `bash-allowlist.json` | `allow`, `ask`, Windows 전용 `windows` 단계로 구성되며 미일치 명령은 거부한다 |
| 기타 내장 도구 | `tool-policy.json` | `websearch: deny`와 같은 강제 동작을 정의한다 |
| 계약·통합 테스트 | `../../test/permission/bash-allowlist.test.ts` | 도구 ID, 우선순위, 승인 요청, 거부, 승인 우회를 검증한다 |
| 일반 권한 테스트 | `../../test/permission/next.test.ts` | bash에는 포크 전용 의미가 있으므로 bash 이외의 권한을 사용한다 |

## 불변 조건

- Bash 정책의 유일한 원본은 `bash-allowlist.json`이다. 설정 규칙이나 `always` 승인이 정책 범위를 넓혀서는 안 된다.
- 파싱된 모든 하위 명령을 평가한다. `allow`가 `ask`보다 우선하며 미일치 명령은 거부한다.
- `windows` 패턴은 Windows에서만 `ask`에 추가한다. 다른 플랫폼에 적용하지 않는다.
- `BASH_PERMISSION`과 `ShellID.ToolID`를 동일하게 유지한다. upstream에서 이름이 바뀌면 계약 테스트가 실패해야 한다.
- `tool-policy.json`에 있는 키는 일반 설정 평가를 우회한다. 없는 키는 upstream 동작을 유지한다.
- 현재 빌드에 도구가 없더라도 `interactive_bash`는 선제적으로 거부 상태를 유지한다.

## 금지 사항

- 하드코딩된 정책을 우회하는 설정 또는 세션 승인 경로를 추가하지 않는다.
- 명령 이름 일치를 네트워크 샌드박스로 간주하지 않는다. 인자, 스크립트, `webfetch`, 승인된 명령은 여전히 외부 통신을 만들 수 있다.
- 일반 권한 우선순위를 `bash`로 테스트하지 않는다. 하드코딩 정책이 없는 권한을 사용한다.
- 정책 JSON을 변경하면서 전용 통합 테스트를 갱신하지 않는 일을 금지한다.

## 검증

`packages/opencode`에서 실행한다.

```bash
bun test test/permission/bash-allowlist.test.ts test/permission/next.test.ts
bun typecheck
```
