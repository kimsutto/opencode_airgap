<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

<!-- =====================================================================
     AIR-GAP FORK 가이드 (사내 배포용) — fork-specific. 이 블록은 upstream 과
     충돌하지 않도록 한 곳에 모아둡니다. upstream 의 원본 README 내용은 아래
     "Installation" 섹션부터 그대로 유지됩니다.
     ===================================================================== -->

## Air-gap (사내 배포) 가이드

이 저장소는 upstream OpenCode 를 사내(폐쇄망)에서 안전하게 쓰기 위한 fork 입니다.
핵심 원칙은 **최소 수정 · 분리된 파일 · upstream 추적 용이성** 입니다. 보안 정책은
가능한 한 별도 파일(`*.json`)에 두고, 코드 변경은 한 곳(권한 chokepoint)에 모읍니다.

핵심 정책 한 줄 요약:

- **bash/shell**: `bash-allowlist.json` 에 있는 명령만 `ask`(매번 확인), 나머지는 전부 `deny`.
  config/agent/세션 승인으로 절대 우회 불가. 한 번 허용해도 `allow` 로 승격되지 않음.
- **내장 tool**: `webfetch` = `ask`, `websearch` = `deny`, `interactive_bash` = `deny` (config 무시).
- **MCP**: 완전 비활성화. 어떤 MCP tool 도 모델에 노출되지 않음.
- **개인정보 문구**: 시작 화면(홈)에 "개인정보를 넣지 마세요" 경고 상시 표시.

수정한 파일 목록(여기만 보면 됨):

| 목적 | 파일 |
| --- | --- |
| bash 허용목록 (정책 데이터) | `packages/opencode/src/permission/bash-allowlist.json` |
| 비-bash tool 정책 (정책 데이터) | `packages/opencode/src/permission/tool-policy.json` |
| 권한 chokepoint (정책 적용) | `packages/opencode/src/permission/index.ts` |
| MCP 비활성화 | `packages/opencode/src/mcp/index.ts` |
| 개인정보 문구 | `packages/tui/src/routes/home.tsx` |
| 테스트 | `packages/opencode/test/permission/bash-allowlist.test.ts`, `.../next.test.ts` |

### 로그 추가 / 수정할 때 수정해야 하는 부분

- 로깅은 `@opencode-ai/core/util/log` 의 `Log.create({ service: "..." })` 패턴을 씁니다.
- 권한 판단 로그는 `packages/opencode/src/permission/index.ts` 의 `ask` 안에 있습니다.
  - `log.info("evaluated", { permission, pattern, action })` — 매 패턴마다 결정된 action.
  - `log.info("asking", { id, permission, patterns })` — 실제로 사용자에게 물을 때.
  - air-gap 정책(allowlist/tool-policy) 관련 로그를 더 붙이려면 `hardcodedAction(...)`
    호출 직후, `evaluated` 로그 근처에 추가하면 됩니다.
- MCP 관련 로그는 `packages/opencode/src/mcp/index.ts` 의 `service: "mcp"` 로거를 사용합니다.
  (우리 fork 는 `tools()` 와 state 빌더에서 MCP 를 막으므로, 차단 사실을 남기고 싶으면
  해당 주석 위치에 `log.info(...)` 를 추가하세요.)
- 로그 레벨/출력 위치 등 전역 설정은 upstream `util/log` 구현을 따르며 우리가 바꾸지 않습니다.

### OpenCode UpStream 따라가는 법

기본 흐름:

```bash
git remote add upstream https://github.com/anomalyco/opencode   # 최초 1회
git fetch upstream
git checkout dev            # (또는 release_airgap 작업 브랜치)
git merge upstream/dev
```

- 우리 변경은 의도적으로 **작고 격리**되어 있어 대부분 깔끔히 머지됩니다.
- 충돌이 자주 날 수 있는 파일은 위 "수정한 파일 목록" 의 4개 코드 파일입니다.
  특히 `permission/index.ts` 와 `mcp/index.ts`.
- **충돌이 너무 심할 때 권장 절차**:
  1. 정책 *데이터*(`bash-allowlist.json`, `tool-policy.json`)는 순수 JSON 이라 거의 충돌
     나지 않습니다. 그대로 둡니다.
  2. `permission/index.ts` 충돌 시: upstream 쪽 `ask`/`evaluate` 구현을 **우선 채택**한 뒤,
     우리 추가분인 (a) import 2줄(`bash-allowlist.json`, `tool-policy.json`),
     (b) `BASH_ALLOWLIST`/`TOOL_POLICY`/`bashAction`/`hardcodedAction` 정의,
     (c) `ask` 루프 안의 `const forced = hardcodedAction(...)` 분기만 다시 얹습니다.
  3. `mcp/index.ts` 충돌 시: upstream 구현을 받은 뒤 `tools()` 최상단의 `return result`
     한 줄과 state 빌더의 `const config ... = {}` 한 줄(둘 다 "Air-gap:" 주석 표시)만 다시 적용.
  4. **권한 key 가 바뀌었는지 반드시 확인**: 아래 "permission.ts (V2)" 섹션 참고. 계약 테스트
     (`Permission.BASH_PERMISSION === ShellID.ToolID`)가 깨지면 upstream 이 `bash` key 를
     리네임한 것이므로 그에 맞춰 갱신합니다.
  5. 마지막으로 `bun test test/permission` 로 정책이 살아있는지 검증.

### OpenCode Test 방법

- **권한 정책 단위/통합 테스트** (가장 중요, 머지 후 반드시 실행):
  ```bash
  cd packages/opencode
  bun test test/permission/bash-allowlist.test.ts test/permission/next.test.ts
  ```
  - `bash-allowlist.test.ts`: allowlist 순수 함수(`bashAction`/`hardcodedAction`) + "config/세션
    승인으로 우회 불가" 통합 테스트 + webfetch/websearch 강제 정책.
  - `next.test.ts`: 일반 권한 엔진(evaluate/ask) 테스트.
- **전체 테스트**: `cd packages/opencode && bun test`.
- **타입 체크**: 루트에서 `bun run typecheck` (turbo), 또는 패키지별 `cd packages/opencode && bun run typecheck`.
- **빌드 후 직접(E2E) 확인**:
  ```bash
  cd packages/opencode
  bun run script/build.ts --single        # 현재 OS/arch 단일 네이티브 바이너리
  ./dist/opencode-<os>-<arch>/bin/opencode
  ```
  실제로 확인할 것:
  1. 홈 화면에 개인정보 경고 문구가 보이는지.
  2. 허용 명령(예: `ls`, `git status`)은 확인 프롬프트가 뜨고, 목록 밖 명령(예: `ssh ...`)은
     바로 거부되는지.
  3. `webfetch` 는 확인을 묻고 `websearch` 는 거부되는지.
  4. MCP 서버를 config 에 넣어도 모델 tool 목록에 안 나타나는지.
- 개발 중에는 빌드 없이 `bun run packages/opencode/src/index.ts` 로도 실행 가능합니다.

### Mac, Window 각각 command rules

bash 정책 데이터는 `packages/opencode/src/permission/bash-allowlist.json` 한 파일에 있습니다.

```jsonc
{
  "allow": [],            // 항상 비워둠 (자동 실행 금지). 채우지 마세요.
  "ask":   [ "ls *", ... ],   // 크로스플랫폼 / POSIX(Git Bash 포함) 명령. 매번 확인.
  "windows": [ "dir *", "Get-ChildItem *", ... ]  // win32 에서만 ask 목록에 추가됨
}
```

- 매칭 규칙: shell tool 이 tree-sitter 로 명령을 **하위 명령 단위**로 쪼갠 뒤, 각 조각을
  와일드카드 패턴과 비교합니다(`util/wildcard`). 패턴 끝의 ` *` 는 "인자 없음"도 매칭합니다
  (`"ls *"` 는 `ls` 와 `ls -la` 둘 다 매칭). Windows 에서는 매칭이 **대소문자 무시**입니다.
- **Mac/Linux**: `ask` 목록만 적용됩니다(POSIX 명령). zsh/bash 기준.
- **Windows**: opencode 는 PowerShell/pwsh → Git Bash → cmd 순으로 셸을 자동 선택합니다.
  - Git Bash 를 쓰면 `ls`, `cat`, `git ...` 같은 POSIX 명령이 그대로 적용됩니다(`ask` 목록).
  - cmd/PowerShell 을 쓰면 명령 이름이 다르므로(`dir`, `type`, `Get-ChildItem` …) `windows`
    목록이 `ask` 에 합쳐집니다. 적용은 `index.ts` 의 `process.platform === "win32"` 분기에서 일어납니다.
- 정책을 바꾸려면 **이 JSON 파일만** 편집하세요. 코드 수정 불필요. allow 로 옮기지 말고 ask 에
  추가하는 것을 권장합니다(자동 실행 위험 회피).

### mcp 제한

MCP 는 완전히 비활성화되어 있습니다 (`packages/opencode/src/mcp/index.ts`, "Air-gap:" 주석 2곳):

1. **연결 차단**: state 빌더에서 `const config: NonNullable<typeof cfg.mcp> = {}` 로 강제하여
   config 에 어떤 MCP 서버가 있어도 시작 시 연결(프로세스 spawn/네트워크)하지 않습니다.
2. **모델 노출 차단(확정 보장)**: `tools()` 최상단에서 `return {}` 하여, 설령 런타임에
   `opencode mcp`/HTTP API 로 서버가 추가되더라도 **모델에게는 어떤 MCP tool 도 보이지 않습니다.**

다시 켜야 한다면 위 2곳의 "Air-gap:" 주석 라인을 되돌리면 됩니다.

### 개인정보보호문구

- 위치: `packages/tui/src/routes/home.tsx` — 홈(시작) 화면 로고 바로 아래.
- 내용: `⚠ 개인정보·기밀정보를 입력하지 마세요 (Do not enter personal or confidential information)`.
- 색상은 테마의 `theme.warning` 를 사용합니다. 문구/위치를 바꾸려면 `home.tsx` 의
  "Air-gap: privacy notice" 주석이 달린 `<box>` 를 수정하세요.
- 참고: 이 문구는 TUI 홈 화면 기준입니다. `opencode run`(헤드리스) 사용 시에는 표시되지 않으므로,
  필요하면 해당 진입점에도 별도 안내를 추가해야 합니다.

### 나중에 permission.ts 가 수정될 수도 있음 (V2)

opencode 는 현재 **권한 스택 2개**가 공존합니다:

- **V1 (현재 동작 경로)**: `packages/opencode/src/permission/index.ts` (`@opencode/Permission`).
  실제 CLI/TUI 가 쓰는 경로이며, shell tool(`tool/shell.ts`)이 명령을 파싱해
  `Permission.ask({ permission: "bash", patterns: [...] })` 를 호출합니다. **우리 정책은 모두 여기에 있습니다.**
- **V2 (휴면/미완성)**: `packages/core/src/permission.ts` (`@opencode/v2/Permission`) +
  `packages/core/src/tool/bash.ts`. 아직 tree-sitter/BashArity 포팅 TODO 가 남아 있고
  `packages/opencode` 어디에서도 실제 shell 실행에 쓰이지 않습니다. **그래서 우리는 V2 를 건드리지 않았습니다.**

대비책:

- `permission/index.ts` 의 권한 key 는 문자열 `"bash"` 입니다(`BASH_PERMISSION`).
  `tool/shell/id.ts` 에 "Rename with opencode 2.0" 주석이 있어 upstream 이 언젠가 이 key 를
  바꿀 수 있습니다. 이를 대비해 **계약 테스트**(`Permission.BASH_PERMISSION === ShellID.ToolID`)를
  두었으니, key 가 바뀌면 테스트가 깨져 즉시 알 수 있습니다.
- 만약 upstream 이 실제 shell 실행을 **V2 로 이관**하면, 그때는 같은 정책(allowlist + tool-policy)을
  V2 의 단일 평가 지점(`evaluateInput`)에도 동일하게 적용해야 합니다. 그 전까지 V2 수정은 불필요합니다.

### opencode 에도 bypassPermission 같은 게 있는지 / 우리 정책의 우회 방지

- opencode 에는 Claude Code 의 `bypassPermissions` 같은 **전역 "전부 통과" 토글이 없습니다.**
- 대신 권한을 느슨하게 만드는 합법적 경로가 셋 있습니다. 모두 `Permission.ask` 로 들어오는
  ruleset 으로 병합됩니다:
  1. config `permission` 규칙 (예: `{ "permission": { "bash": "allow" } }`)
  2. agent 별 `permission`
  3. 세션(`session.permission`) — "always/항상 허용" 누적
- **우리 fork 의 방어**: `Permission.ask` 안에서 정책 대상 key(`bash`, `webfetch`,
  `websearch`, `interactive_bash`)는 `hardcodedAction(...)` 으로 **먼저, 단독으로** 결정되고
  위 ruleset 은 아예 참조되지 않습니다. 따라서 config/agent/세션 어느 것으로도 우회되지 않으며,
  "한 번 always 허용"도 `bash` 신규 호출에는 매번 다시 프롬프트가 뜹니다(allow 로 승격 안 됨).
- 즉, upstream 이 새로운 "auto-approve" 류 기능을 추가하더라도, 그 기능이 결국 ruleset/승인으로
  귀결되는 한 위 4개 key 에는 효력이 없습니다. (전혀 다른 새 우회 경로가 생기면 그때
  `hardcodedAction` 분기를 동일 지점에 유지하는지 재확인하세요.)

### 윈도우용으로 빌드하는 방법

빌드는 Bun 의 크로스 컴파일을 사용하므로 **Mac/Linux 에서도 Windows 바이너리**를 만들 수 있습니다.

```bash
cd packages/opencode
# 전체 타겟(리눅스/맥/윈도우 모두) 빌드 — 결과물은 dist/ 아래 타겟별 폴더
bun run script/build.ts
# 산출물 예: dist/opencode-windows-x64/bin/opencode(.exe)
#           dist/opencode-windows-arm64/bin/...
#           dist/opencode-windows-x64-baseline/bin/...  (구형 CPU/AVX2 미지원용)
```

- Windows 머신에서 직접 단일 빌드: `bun run script/build.ts --single` (현재 OS=win32 기준).
- 타겟 정의는 `script/build.ts` 의 `allTargets`(os: `win32`, arch: `x64`/`arm64`) 에 있습니다.
- 패키징/릴리스(zip 업로드)는 `--release`(내부적으로 `Script.release`) 경로에서 수행됩니다.

### 맥용으로 빌드하는 방법

```bash
cd packages/opencode
# 현재 맥(Apple Silicon/Intel) 단일 네이티브 바이너리 — 가장 빠름, 스모크 테스트 포함
bun run script/build.ts --single
# 결과: dist/opencode-darwin-arm64/bin/opencode  (또는 darwin-x64)

# 맥 전체 타겟(arm64 + x64 + x64-baseline)을 명시적으로 만들려면 전체 빌드 사용
bun run script/build.ts
```

- `--single` 은 현재 플랫폼만, 기본은 AVX2 포함(baseline 제외). 구형 Intel 호환이 필요하면
  `--baseline` 플래그를 추가합니다.
- 빌드 시 현재 플랫폼 바이너리는 `--version` 스모크 테스트가 자동 실행됩니다.

<!-- ============== AIR-GAP FORK 가이드 끝 ============== -->

---

### Installation

```bash
# YOLO
curl -fsSL https://opencode.ai/install | bash

# Package managers
npm i -g opencode-ai@latest        # or bun/pnpm/yarn
scoop install opencode             # Windows
choco install opencode             # Windows
brew install anomalyco/tap/opencode # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-bin               # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run nixpkgs#opencode           # or github:anomalyco/opencode for latest dev branch
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

OpenCode is also available as a desktop application. Download directly from the [releases page](https://github.com/anomalyco/opencode/releases) or [opencode.ai/download](https://opencode.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/opencode-desktop
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$OPENCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.opencode/bin` - Default fallback

```bash
# Examples
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/install | bash
```

### Agents

OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents).

### Documentation

For more info on how to configure OpenCode, [**head over to our docs**](https://opencode.ai/docs).

### Contributing

If you're interested in contributing to OpenCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
