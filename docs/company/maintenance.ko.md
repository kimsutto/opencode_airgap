# 사내 OpenCode v1 유지보수

원본 기준: OpenCode **1.18.33**, 공식 `dev`의 `2fa3363c924c5c3e367b84a87ae478296a0ed59b`.
사내 변경은 이 원본 위의 단일 커밋 `feat(company): apply internal controls`로 유지한다.
배포 중인 `codex/sync-upstream-20260714`는 별도 관리하며 이 브랜치로 덮어쓰지 않는다.

## 사내 변경 범위

- `packages/opencode/src/company/bash-allowlist.json`: 셸 명령 allow/ask 목록과 Windows 전용 목록. 나머지 명령은 deny.
- `packages/opencode/src/company/tool-policy.json`: webfetch는 ask, websearch와 interactive_bash는 deny.
- `packages/opencode/src/company/policy.ts`: 일반 설정과 저장 승인보다 사내 정책을 우선 적용.
- `packages/opencode/src/company/compliance/`: 프롬프트·모델 응답·도구 요청/결과·승인 요청/응답을 감사 서버에 전송.
- 원본 런타임 연결은 `permission/index.ts`, `plugin/index.ts`, `packages/tui/src/routes/home.tsx` 세 파일이다.
- `packages/opencode/script/build.ts`에서 감사 endpoint를 주입하고 Web UI를 포함하는 prod 채널로 빌드한다.
- 기존 권한 테스트와 셸 fixture를 정책에 맞추고 감사·개별 승인 회귀 테스트를 유지한다.

회사 ask 요청은 '항상 허용'을 선택해도 해당 요청만 승인한다. 다른 대기 요청과 이후 요청은 각각 승인해야 한다.
MCP는 원본 동작을 유지한다. 사용자 직접 셸(`!`), 플러그인 자체 프로세스/통신, 모델 공급자 통신까지 통제하는 OS·네트워크 sandbox는 아니다.
허용 목록에는 파일을 변경할 수 있는 명령도 있다.

감사 envelope의 `user_id`는 로컬 IPv4이며 사번이 아니다. `ts`는 KST, `command`는 JSON 문자열이다.
`assistant.message`에 원본 prompt와 response가 함께 들어간다. 전송은 최대 2회, 각 timeout 2초, 재시도 간격 250ms이며 로컬 감사 fallback은 없다.
TUI 홈에 개인정보·민감정보 입력 주의 문구를 표시한다.

## 빌드

Bun과 의존성을 준비한 뒤 저장소 루트에서 실행한다. 감사 주소는 사내 승인된 환경변수로 미리 설정한다.

```sh
bun install --frozen-lockfile
cd packages/opencode
OPENCODE_COMPLIANCE_ENDPOINT="${OPENCODE_COMPLIANCE_ENDPOINT:?Set approved endpoint privately}" \
  OPENCODE_VERSION=1.18.33-company.3 bun run script/build.ts --single
```

현재 OS용 산출물은 `packages/opencode/dist/<target>/bin/`에 생성된다.
Windows x64 등을 교차 빌드하려면 해당 플랫폼 의존성을 설치하고 `--single`을 제거한다.
Windows x64 산출물은 `packages/opencode/dist/opencode-windows-x64/bin/opencode.exe`다.

감사 endpoint는 바이너리에 고정된다. 실행 시 환경변수로 바뀌지 않는다.
빌드 endpoint가 비어 있으면 실행 시 감사 플러그인 시작이 실패한다.
소스 개발 실행에는 빌드 상수가 없어 감사가 비활성화되므로 사내 사용과 정책 검증에는 빌드 산출물을 사용한다.
오프라인 배포 시 OS/CPU에 맞는 `rg`를 함께 제공하고 PATH에 넣는다.
배포 런처에서 `OPENCODE_DISABLE_AUTOUPDATE=true`, `OPENCODE_DISABLE_MODELS_FETCH=true`를 설정한다.
모델 설정·인증정보·실제 endpoint·바이너리·배포 해시는 공개 Git에 넣지 않는다. 비공개 배포 자료는 저장소 밖이나 `.company-private/`에 보관한다.

## 검증

패키지 디렉터리에서 실행한다.

```sh
cd packages/opencode
bun test test/permission test/company test/permission-task.test.ts --timeout 30000 --only-failures
bun typecheck
```

사내 현장 검증은 [반입 검증 체크리스트](checklist.ko.md)를 사용한다. Windows와 Mac에서 실제 도구 결과와 감사 서버 수신을 각각 확인한다.

기존 company.3 기록은 권한/감사 111개 테스트 및 타입 검사 통과, 교차 빌드와 Mac 기동 확인이다.
실제 Windows 실행과 사내 모델·감사 서버 수신은 그 기록만으로 검증 완료로 간주하지 않는다.
과거 배포 ZIP·해시·인수인계 기록은 소스 변경 커밋에 누적하지 않고 별도로 보관한다.

## 원본 업데이트

1. 작업 트리가 깨끗한지 확인하고 현재 사내 커밋과 배포 산출물을 보관한다.
2. 새 원본 커밋을 기준으로 작업 브랜치를 만들고 사내 커밋 하나를 cherry-pick한다.
3. 충돌은 위 연결 지점을 새 원본 구조에 맞추는 범위로 해결한다.
4. `git diff <새-원본-SHA> HEAD`로 사내 변경만 검토하고 위 검증을 수행한다.
5. 원본 기준 SHA와 버전을 이 문서에 갱신하고 사내 변경을 다시 단일 커밋으로 정리한다.

배포 브랜치 간 diff에는 원본 업데이트도 포함되므로 사내 수정량 판단에는 각 원본 기준과의 diff를 사용한다.
원격 이력 교체나 배포 전에 비교 결과를 검토하고 대상 브랜치·버전을 확인한다.
