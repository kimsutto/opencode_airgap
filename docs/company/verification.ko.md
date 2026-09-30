# 검증 기록 (v1)

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
실제 사내 endpoint, 인증/모델 및 oh-my-openagent 설치 버전은 제공되지 않아 해당 환경 E2E는 수행하지 않았다.
Windows/Linux 실행 및 실제 TUI 시각 검사는 미수행이다. 플러그인 판정은 5.1.4 배포 코드와 호스트 API의 정적 대조 결과다.
빌드 산출물은 Git 추적 대상이 아니며 현재 worktree의 dist에 보존돼 있다.
