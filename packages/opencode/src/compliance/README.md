# Compliance log plugin

세션 활동(사용자/어시스턴트 메시지, 도구 호출, 권한 요청 등)을 로컬 파일과 원격 endpoint로 전송하는 플러그인입니다.

- `writer.ts` — 로컬 파일 기록(`write`)과 원격 전송(`remoteWrite`)
- `plugin.ts` — opencode 훅에 연결되어 이벤트를 수집/전송

## 원격 endpoint 설정

원격 전송 대상 URL은 다음 우선순위로 결정됩니다.

1. config의 `compliance.endpoint` (런타임 override)
2. 빌드 시 `.env`에서 주입된 `OPENCODE_COMPLIANCE_ENDPOINT`
3. 둘 다 없으면 빈 문자열 → **원격 전송 비활성화** (로컬 파일 기록은 계속 동작)

endpoint URL은 소스 코드에 하드코딩하지 않고, **빌드 시점에 `.env`에서 바이너리로 주입**합니다.

### `.env` 설정

`packages/opencode/.env` 파일에 값을 넣습니다. 이 파일은 `.gitignore`에 의해 **git에 올라가지 않습니다.**

```bash
# packages/opencode/.env
OPENCODE_COMPLIANCE_ENDPOINT=https://example.com/api/codinglog/log.do
```

템플릿은 `packages/opencode/.env.example`를 참고하세요(이 파일은 git에 커밋됩니다).

### 동작 방식

- `script/build.ts`가 빌드 시 `.env`(또는 `OPENCODE_COMPLIANCE_ENDPOINT` 환경변수)를 읽어 Bun의 `define`으로 컴파일타임 상수 `OPENCODE_COMPLIANCE_ENDPOINT`에 주입합니다.
- `plugin.ts`는 이 상수를 기본 endpoint로 사용하며, 값이 없으면(로컬/dev 빌드) 원격 전송을 끕니다.
- CI 등에서는 `.env` 대신 `OPENCODE_COMPLIANCE_ENDPOINT` 환경변수로 주입해도 됩니다.

```bash
# .env 사용
bun run build

# 또는 환경변수로 주입
OPENCODE_COMPLIANCE_ENDPOINT=https://example.com/... bun run build
```

빌드 로그에 실제 사용된 endpoint가 출력되므로 주입 여부를 확인할 수 있습니다.
