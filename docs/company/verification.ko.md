# 검증 기록 (v1)

## 2026-10-01 현재 상태

[인수인계](HANDOFF.ko.txt)와 [사내 체크리스트](checklist-v1.ko.txt)를 우선 확인한다.
아래 9월 30일 시험용 기록 이후 `1.18.33-company.2`로 실제 사내 감사 URL 빌드를 만들었다.
반입 파일은 `/Users/a420591/Desktop/OpenCode-v1-company.2`에 있고 Git에는 포함하지 않는다.
현재 dist는 아래 최초 시험용 바이너리와 다르다. 배포 파일 해시는
[handoff-assets](handoff-assets/release-zip-SHA256SUMS.txt)에 보존했다.

- Windows x64와 Apple Silicon Mac 빌드 및 rg 15.1.0 동봉 완료.
- 실제 endpoint 문자열 내장, Mac 런처 실행·동봉 rg 검색, ZIP 무결성 확인.
- 실제 Windows 실행, 사내 모델 및 실제 감사 서버 수신은 미검증.
- 추가 서브에이전트/Grep 관련 38개 테스트 통과. 실제 loopback 모델로 자식 세션 실행·반환 확인.
- **새로운 실패:** 같은 세션에서 회사 ask 요청 두 개가 대기할 때 첫 요청을 `always` 승인하면
  두 번째도 별도 승인 없이 해제된다. 회귀 probe에서 기대 pending 1개, 실제 0개로 실패.
  [재현 자료](handoff-assets/pending-approval-regression.test.ts.txt)를 보존했고 결함은 미수정이다.
  기존 전체 테스트 결과를 정책 전체 통과로 해석하면 안 된다.

## 최초 company.1 시험용 기록

2026-09-30 KST, macOS Apple Silicon, Bun 1.4.2.

- `packages/opencode`: 전체 테스트 3,619 pass, 22 skip, 1 todo, 0 fail (257 files).
- `packages/opencode`, `packages/plugin`, `packages/tui`: `bun typecheck` 통과.

- Web UI를 포함한 native 바이너리 빌드 성공.
- `script/company/smoke.py`: 실제 바이너리와 loopback HTTP 모델/감사 서버로 다음 5개 검사 통과.
  - 텍스트 요청 완료
  - 허용된 셸 명령 실행
  - 목록 밖 셸 명령의 권한 거절
  - 사용자/모델 응답 짝 및 도구 요청/결과 감사 전송
  - 감사 서버 503 시 모델 호출 차단

바이너리: `packages/opencode/dist/opencode-darwin-arm64/bin/opencode`

SHA-256: `390e6681e7dcc979c108893ec918f6c806ff0c3eaa5655e0ed4bd8b27b3ffc15`

감사 주소는 `http://127.0.0.1:18788/opencode/compliance`로 고정된 시험용 빌드다.
당시에는 실제 사내 endpoint, 인증/모델 및 oh-my-openagent 설치 버전이 제공되지 않아 해당 환경 E2E는 수행하지 않았다.
Windows/Linux 실행 및 실제 TUI 시각 검사는 미수행이다. 플러그인 판정은 5.1.4 배포 코드와 호스트 API의 정적 대조 결과다.
빌드 산출물은 Git 추적 대상이 아니며 당시 dist는 이후 company.2 빌드로 대체됐다.
