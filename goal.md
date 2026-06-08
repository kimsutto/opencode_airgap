## 해당 프로젝트의 목적 
  - opencode를 사내에서 쓰려면, bash tool 사용 시 정해진 명령어만 ask, 그 외는 전부 deny.
  - 상위 옵션·config가 뭐든 이 룰이 무조건 우선돼야 함.
  - 세션 내에서 한 번 허용해도 계속 ask/deny 되어야 함(영구 allow 승격 금지).
  - 최소한의 수정으로, 앞으로 upstream 업데이트도 계속 따라갈 수 있게.
  - 현재 허용 목록은 bash-allowlist.json에서 관리 

요청 1. ask 되어야하는 bash 명령어. allow라고 되어있는 애들도 다 그냥 ask로 해줘 
```
{
    "ls *": "allow",
      "find *": "allow",
      "rg *": "allow",
      "jq *": "allow",
      "grep *": "allow",
      "cat *": "allow",
      "head *": "allow",
      "glob *": "allow",
      "tail *": "allow",
      "less *": "allow",
      "wc *": "allow",
      "diff *": "allow",
      "echo *": "allow",
      "sed *": "allow",
      "awk *": "allow",
      "vi *": "allow",
      "cut *": "allow",
      "sort *": "allow",
      "uniq *": "allow",
      "tr *": "allow",
      "ag *": "allow",
      "cp *": "allow",
      "mv *": "allow",
      "mkdir *": "allow",
      "touch *": "allow",
      "chmod *": "allow",
      "pwd *": "allow",
      "env *": "allow",
      "whoami *": "allow",
      "ll *": "allow",
      "la *": "allow",
      "tree *": "allow",
      "ps *": "allow",
      "top *": "allow",
      "df -h *": "allow",
      "du *": "allow",
      "df *": "allow",
      "pgrep *": "allow",
      "lsof *": "allow",
      "stat *": "allow",
      "file *": "allow",
      "realpath *": "allow",
      "more *": "allow",
      "git status *": "allow",
      "git diff *": "allow",
      "git log *": "allow",
      "git show *": "allow",
      "git branch --show-current *": "allow",
      "git ls-files *": "allow",
      "svn status *": "allow",
      "svn diff *": "allow",
      "svn log *": "allow",
      "svn info *": "allow",
      "dd *": "allow",

      "rmdir *": "ask",
      "rm *": "ask",
      "curl *": "ask",
      "wget *": "ask",
      "mvn compile *": "ask",
      "mvn package *": "ask",
      "mvn test *": "ask",
      "mvn dependency:tree *": "ask",
      "gradle build *": "ask",
      "gradle test *": "ask",
      "javac *": "ask",
      "java -jar *": "ask",
      "java -cp *": "ask",
      "node *": "ask",
      "npm *": "ask",
      "pnpm *": "ask",
      "npx *": "ask",
      "bun *": "ask",
      "pip *": "ask",
      "uv *": "ask",
      "python *": "ask",
      "python3 *": "ask",
      "pytest *": "ask",
      "pyright-langserver *": "ask",
      "svn add *": "ask",
      "svn commit *": "ask",
      "svn update *": "ask",
      "kill *": "ask",
      "pkill *": "ask",
      "nohup *": "ask",
      "sh *": "ask",
      "bash *": "ask",
      "tail -f *": "ask",
      "zsh *": "ask",
      "tsc *": "ask",
      "eslint *": "ask",
      "prettier *": "ask",
      "vite *": "ask",
      "vitest *": "ask",
      "jest *": "ask",
      "storybook *": "ask",
      "webpack *": "ask",
      "rollup *": "ask",
      "parcel *": "ask",
      "turbo *": "ask",
      "nx *": "ask",
      "git add *": "ask",
      "git commit *": "ask",
      "git fetch *": "ask",
      "git pull *": "ask",
      "git push *": "ask",
      "jdtls *": "ask",
      "eclipse.jdt.ls *": "ask",
}
```
요청 2. 윈도우 대응 
윈도우에서도 해당 오픈코드를 쓸건데, 윈도우는 bash shell이 있나? 
윈도우용 cmd, 

요청 3. 내장 Tool 중에 
 "webfetch": "ask",
"websearch": "deny",
"interactive_bash": "deny"
하도록 수정 

요청 4. mcp 사용 못하게 수정 

요청 5. opencode 처음 실행 시, 안내 문구로 '개인정보를 넣지 마세요' 문구 추가 



이 모든 요청을 하면서 가장 중요한 것은 
최신 upstream을 따라가야함으로 최소한의 수정과 분리된 파일로 관리해야할 것 


요청 6. README.md 업데이트 
아래 타이틀에 대해 내용을 채워놓기 
나중에 다른 사람이 이 프로젝트를 이어 받을 수 있또록 

```
### 로그 추가 / 수정할 때  수정 해야하는 부분 


### OpenCode UpSteam 따라가는 법 
* 만약 dev pull 후, merge했을 때 충돌이 너무 나는 경우 

### OpenCode Test 방법 
* E2E 테스트나 
* 빌드 후 직접 테스트 해보는 방법에 대해 

### Mac, Window 각각 command rules

### mcp 제한

### 개인정보보호문구  

### 나중에 permission.ts 가 수정될 수도 있음 (V2)

### opencode에도 bypermission 같은거 있는지 있으면 이거 대체 방법 

### 윈도우용으로 빌드하는방법

### 맥용으로 빌드하는 방법 
```