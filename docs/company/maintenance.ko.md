# v2 사내 포크 유지보수

회사 정책 원본은 `7035979e0`, 이번 공식 기반은 `74dbc509d74df46a2523676dd4068225c4f0c9b0`이다.
공식 `v2`와 사내 포크의 `origin/dev`는 서로 다른 기준이다. 업데이트 시 공식 `v2`의 SHA를 먼저 기록한다.

## 변경 지도

- `packages/core/src/company`: 기존 정책 JSON, v2 권한 이름 매핑, 감사 전송 및 DB 메시지 대응.
- `packages/core/src/permission.ts`: 회사 정책은 저장된 승인과 외부 플러그인보다 먼저 결정한다. `shell`과 레거시 `bash`를 같은 정책으로 처리한다. 회사 ask 요청은 저장 가능한 승인을 제공하지 않는다.
- `packages/core/src/session/prompt.ts`: 플러그인 처리 후 사용자 입력과 세션 메타데이터 전송.
- `packages/core/src/tool.ts`: 실제 도구 입력과 결과 전송. CodeMode에서 호출하는 실제 도구도 기존 실행 경로를 따른다.
- `packages/core/src/session/runner/step.ts`: 완료된 응답이 DB에 반영된 뒤 사용자 프롬프트와 함께 전송. 전송 실패는 실행에 전파한다.
- `packages/tui/src/routes/home.tsx`: 개인정보 고지.
- `packages/cli/script/build.ts`: 감사 주소를 컴파일 상수로 주입.

MCP는 원본 동작을 유지한다. 세션 입장·대기열·모델 루프는 원본 구조를 유지한다.
코어를 직접 연결한 이유는 선택적 외부 플러그인 제거·실패 격리 때문에 감사 기능이 사라지지 않도록 하기 위해서다.
이 패치가 임의 플러그인의 프로세스/네트워크 직접 실행을 격리하는 것은 아니다.

## 업데이트

공식 기반에서 별도 브랜치를 만들고 회사 커밋을 다시 적용한다. 패키지 이름·도구 권한·플러그인 API 변화는 실제 실행 경로에서 검증한다.
회사 변경은 한 커밋으로 정리하고 원본 코드 변경은 위 연결 지점에 한정한다.

```sh
cd packages/core
bun test test/company test/permission.test.ts test/session-step.test.ts test/session-prompt.test.ts test/session-runner.test.ts test/session-runner-tool-events.test.ts
bun typecheck
cd ../cli && bun typecheck
cd ../tui && bun typecheck
```

전체 lint/타입 검사는 루트에서 `bun run check`로 수행한다.
모델/감사 서버를 loopback 시험 서버로 두고 빌드된 바이너리로 프롬프트·응답 전송, 허용 명령 실행, 금지 명령 거절을 검증한다.
실제 사내 endpoint는 승인된 주소로 재빌드한다. [병행 실행](trial.ko.md), [플러그인 호환성](oh-my-openagent.ko.md)을 참고한다.
Windows/Linux 바이너리와 실제 사내 모델·로그 서버 검증은 별도 환경에서 수행한다.
