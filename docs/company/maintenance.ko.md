# 사내 OpenCode 포크 유지보수

이 문서는 공식 upstream `https://github.com/anomalyco/opencode`의 `dev`를 확인하고, 사내 변경을 수동으로 다시 적용하는 운영 절차다. fetch, 브랜치 생성, 충돌 해결, push, PR 생성, merge, release는 담당자가 각 단계의 결과를 확인하며 수행한다.

## 변경 구조와 원칙

- upstream 기준 브랜치는 `dev`이며 fast-forward 관계가 깨지면 진행하지 않는다.
- 회사 기능은 최종적으로 `feat(company): apply internal controls`라는 **단일 회사 커밋** 하나로 유지한다.
- 회사 변경 파일은 이 문서의 변경 지도와 `origin/dev...HEAD` diff로 확인한다. upstream 파일을 수정하는 연결 지점은 최소화한다.
- MCP는 공식 upstream 동작으로 원복되어 있다. 사내 정책이라는 이유로 MCP 연결을 차단하는 코드를 다시 넣지 않는다.
- 컴플라이언스 감사, 개인정보 고지, Permission V2 정책은 회사 모듈과 얇은 연결 지점으로 유지한다.

## 현재 회사 변경 기준

- upstream 런타임 제품 코드 수정 파일은 **3개**다.
- 빌드 스크립트, README와 기존 테스트까지 포함하면 upstream 기존 파일 수정은 **8개**다.
- MCP 회사 제한은 제거했으며 공식 upstream의 설정, 연결, OAuth, 모델 도구 노출 동작을 유지한다.
- 한국어 개인정보 고지는 TUI 홈 화면에 유지한다.
- 원본 수정 범위를 줄이기 위해 headless 개인정보 고지는 의도적으로 포함하지 않는다.

원본 런타임 제품 코드 수정 파일은 다음 3개로 제한한다.

1. `packages/opencode/src/permission/index.ts`
2. `packages/opencode/src/plugin/index.ts`
3. `packages/tui/src/routes/home.tsx`

## upstream 확인 및 동기화

1. 작업 트리가 깨끗하고 사내 변경이 단일 커밋인지 확인한 뒤 커밋 SHA를 기록한다.
2. 공식 upstream `dev`를 가져온다.

   ```sh
   git fetch https://github.com/anomalyco/opencode.git dev
   ```

3. 가져온 upstream을 기준으로 동기화 브랜치를 만든다.

   ```sh
   git switch -c sync/upstream-YYYYMMDD FETCH_HEAD
   ```

4. 기록한 사내 커밋을 다시 적용한다.

   ```sh
   git cherry-pick <사내-커밋-SHA>
   ```

5. 충돌이 발생하면 회사 변경 파일만 현재 upstream 구조에 맞춰 최소 수정한다. 이전 upstream 구현을 통째로 복사하지 않는다.
6. `git diff FETCH_HEAD...HEAD --stat`과 아래 검증을 확인한 뒤에만 push와 PR 생성을 별도로 승인받는다. PR 제목은 `chore: sync official upstream dev` 형식을 사용한다.

## 변경 지도와 필수 검증

| 영역 | 확인 내용 |
| --- | --- |
| 컴플라이언스 | 빌드 시 고정된 endpoint로 내장 플러그인이 사용자 프롬프트와 완료된 모델 응답을 원격 전송하는지 검증한다. `assistant.message`의 `data.prompt`와 `data.response`에 사용자 프롬프트와 모델 응답이 함께 있어야 한다. 로컬 저장 fallback은 없으며 원격 전송 실패 시 동작이 실패해야 한다. endpoint와 인증 정보가 로그에 남지 않아야 한다. |
| MCP | 공식 upstream 설정과 오류를 그대로 반환하고 연결이 허용되는지 확인한다. 잘못된 설정도 사내 차단 메시지가 아닌 upstream 오류여야 한다. |
| 개인정보 | TUI의 한국어 개인정보 고지가 한 번만 보이는지 확인한다. headless 실행에는 고지가 없다. |
| Permission V2 | 모델이 호출하는 도구·셸 허용 정책이 동일하게 적용되는지 확인한다. 사용자가 `!`로 직접 실행하는 셸은 이 정책 대상이 아니다. |
| 테스트 fixture | 일반 Permission 상태 머신은 정책 비대상 권한으로 검증하고, 실제 bash 실행 fixture는 회사 allowlist에 포함된 명령을 사용한다. |
| 우회 분석 | `webfetch`, provider/auth, update 기능, 사용자가 승인한 셸 명령 등 정책 밖 네트워크 우회 가능성을 별도 목록으로 검토한다. |

테스트는 저장소 루트가 아니라 패키지에서 실행한다.

```sh
cd packages/opencode
bun test --timeout 30000
bun typecheck
cd ../plugin && bun typecheck
cd ../tui && bun typecheck
```

E2E에서는 정상 경로와 잘못된 설정, 중단·재시작, cleanup을 확인한다. macOS에서는 arm64 native artifact를 검사한다. Windows에서는 x64 native artifact와 PowerShell/경로 구분자를 확인한다. 두 운영체제의 scenario ID와 artifact hash 기록 방식은 같아야 한다.
빌드 스크립트는 공식 릴리스와 같은 Web UI를 포함하도록 `OPENCODE_CHANNEL=prod`를 상시 사용한다.

## macOS에서 mac(siliconmac기준) 빌드 생성
```
cd packages/opencode
OPENCODE_COMPLIANCE_ENDPOINT="http://127.0.0.1:8788/opencode/compliance" \
  bun run script/build.ts --single
```
산출물 위치
./dist/opencode-darwin-arm64/bin/opencode


## macOS에서 Windows 빌드 생성

Windows 실행 파일은 macOS에서 전체 native build를 실행한 뒤 Windows x64 산출물만 가져간다. endpoint는 실행 시 환경변수가 아니라 빌드 시 `OPENCODE_COMPLIANCE_ENDPOINT` 값으로 바이너리에 고정된다.

```sh
cd packages/opencode
OPENCODE_COMPLIANCE_ENDPOINT="http://127.0.0.1:8788/opencode/compliance" bun run script/build.ts
```

Windows x64 산출물은 다음 경로에 생성된다.

```text
packages/opencode/dist/opencode-windows-x64/bin/opencode.exe
```

빌드 시 endpoint가 비어 있으면 실행 시 컴플라이언스 플러그인 시작이 실패한다. Windows 실행 환경에서 `OPENCODE_COMPLIANCE_ENDPOINT`를 바꿔도 빌드에 박힌 endpoint는 바뀌지 않는다.

## 릴리스 체크리스트

upstream 확인과 사내 변경 재적용은 자동화하지 않는다. release endpoint는 승인된 환경변수로만 주입하고 upstream publish workflow는 사내 fork에서 실행하지 않는다. `company-v*` 태그를 만들기 전에 다음을 수동으로 확인한다.

- Linux x64, macOS arm64, Windows x64에서 같은 scenario ID로 native build와 핵심 시나리오가 모두 통과한다.
- 세 운영체제의 artifact hash를 함께 기록하고 전체 결과가 PASS인지 확인한다.
- endpoint와 인증 정보가 로그에 포함되지 않는다. endpoint 자체는 빌드 산출물에 고정된다.
- `origin/dev...HEAD` diff에 의도한 회사 변경 파일만 포함된다.
- MCP가 upstream 원본 동작을 유지한다.
- TUI 개인정보 고지, 컴플라이언스 원격 전송, Permission 정책을 실제 실행 환경에서 확인한다.
- 보호 대상 `AGENTS.md`가 회사 커밋에 포함되지 않는다.

현재 변경에서는 opencode 전체 테스트와 opencode/plugin/tui 타입 검사를 수행했다. native 빌드와 운영체제별 수동 QA까지 완료한 릴리스로 간주하지 않으며, 실제 배포 전에 위 항목을 반드시 수행한다. push, PR, 태그, 배포는 각각 별도 승인을 받아야 한다.

## 롤백

롤백 기준은 가장 최신 `company-v*` 태그다. 태그가 없으면 최초 회사 기준 `6e2f295bb`를 사용한다. 둘 다 확인할 수 없으면 임의 SHA를 선택하지 말고 롤백을 중단한다.

1. disposable clone에서 rollback 기준을 checkout한다.
2. native build와 핵심 E2E를 다시 실행해 복원 가능성을 확인한다.
3. 운영 반영은 별도 변경 승인과 배포 절차로 수행한다. reset, tag 생성, push, PR, merge, release는 각 단계에서 별도 승인한다.
4. 실패 원인, 선택한 기준 SHA, 검증 결과와 cleanup 영수증을 보관한다.
