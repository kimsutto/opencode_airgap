# 사내 OpenCode v1 병행 체험

확인일: 2026-09-30 (KST). 브랜치: `codex/company-v1`.
공식 `dev` 기준: `2fa3363c924c5c3e367b84a87ae478296a0ed59b` (패키지 버전 1.18.33).
사내 정책 기준: `7035979e0`.

## 체험 빌드

현재 macOS Apple Silicon 산출물은 **로컬 시험용**이다. 감사 주소는
`http://127.0.0.1:18788/opencode/compliance`로 고정돼 있다.
실제 사내 서버에 전송하는 배포본은 승인된 주소로 다시 빌드해야 한다.

저장소 루트에서 별도 터미널에 시험 수집기를 실행한다 (둘 중 한 저장소에서 한 번만 실행).

```sh
python3 script/company/audit-demo.py --output /tmp/opencode-company-audit.jsonl
```

다른 터미널에서 다음을 실행한다.

```sh
./script/company/run.sh --version
./script/company/run.sh /path/to/trial-project
```

각 버전은 `~/.local/share/opencode-company/v1/` 아래 별도 설정·캐시·DB·임시 파일을 쓴다.
전역 자동 업데이트는 체험 런처에서 비활성화한다. 모델과 인증은 각 버전에서 설정해야 한다.
프로젝트 자체의 `.opencode` 설정과 실제 파일은 공유되므로, 비교 실험은 별도의 시험 프로젝트 복사본에서 실행한다.
`OPENCODE_COMPANY_HOME`으로 시험 데이터 경로, `OPENCODE_COMPANY_BINARY`로 다른 플랫폼 바이너리를 지정할 수 있다.


## 사내 서버를 사용하는 빌드

Bun을 PATH에 준비하고 루트에서 `bun install --frozen-lockfile`을 수행한다.

```sh
OPENCODE_COMPLIANCE_ENDPOINT='https://your-approved-audit-server/path' \
  ./script/company/build.sh --single --skip-install
```

다른 OS용 빌드에서는 `--single`을 제거하고 필요한 native dependencies를 설치한다.
소스 개발 실행은 빌드 상수가 없어 감사가 비활성화된다. 정책 확인과 사내 사용은 반드시 위 빌드 산출물로 한다.
소스 실행을 사내 배포 실행 방식으로 사용하지 않는다.

## 정책

- 모델 셸 호출은 기존 회사 allow/ask 목록을 사용하며 그 밖의 명령은 거부한다.
- `websearch`, `interactive_bash` 거부, `webfetch` 매번 승인. MCP는 공식 동작 유지.
- 사용자 입력, 도구 요청·결과, 권한 요청·응답, 완료된 모델 응답을 감사 서버로 전송한다.
- 외부 envelope는 `user_id`(로컬 IPv4), KST `ts`, JSON 문자열 `command`를 유지한다.
- 감사 서버가 응답하지 않으면 두 번의 전송 시도 후 실패하며 로컬 대체 저장은 없다.
- TUI 홈에 한국어 개인정보 고지를 표시한다. headless 고지는 추가하지 않는다.
- 사용자 직접 셸(`!`), 플러그인의 자체 네트워크/프로세스 실행, 모델 공급자 통신 등은 기존 정책과 동일하게 별도 통제 대상이다.
- v2 응답 로그는 `data.prompt`와 `data.response`에 v2 메시지 구조를 담는다. v1의 `parts` 기반 로그 소비기라면 v2의 `text`/`content`를 처리하도록 확장해야 한다.

## 플러그인 호환성

[oh-my-openagent 호환성 조사](oh-my-openagent.ko.md)를 참고한다.

## 바이너리 통합 검사 재현

시험 수집기를 먼저 종료하고 (포트 18788을 사용), loopback 주소로 빌드한 바이너리에 대해 실행한다.

```sh
python3 script/company/smoke.py
```

이 검사는 임시 프로필·프로젝트와 로컬 모델 서버를 사용한다. 사용자 전역 설정·API 키를 복사하지 않는다.
허용 명령, 금지 명령, 프롬프트·응답/도구 감사 전송, 감사 서버 503 시 모델 호출 차단을 확인하고 임시 프로필과 서버를 정리한다.

[검증 결과와 바이너리 해시](verification.ko.md)
