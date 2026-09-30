# oh-my-openagent 호환성 확인

확인일: 2026-09-30 (KST). 사내 실제 설치 버전은 아직 제공되지 않았다.
npm `oh-my-openagent/latest` 조회 결과 `5.1.4`를 내려받아 배포 코드를 확인했다.

- 패키지 `exports["."]`와 `exports["./server"]`는 `dist/index.js`를 가리킨다.
- 기본 export는 `{ id: "oh-my-openagent", server: serverPlugin }`이며 `setup`/`effect`가 없다.
- v1 최신 로더는 `server` 형식을 수용한다. 이는 로딩 계약 호환성을 의미하며 사내 설정·모델·전체 플러그인 기능의 E2E 검증은 아니다.
- v2 로더(`packages/core/src/plugin/module.ts`)는 기본 export의 `id`와 `effect` 또는 `setup`을 요구한다. 따라서 조사한 5.1.4 배포본은 v2에서 로딩 계약부터 호환되지 않는다.
- v2에 억지로 등록하거나 서드파티 포크로 대체하지 않았다. v1에서 기존 플러그인을 사용하고 v2는 기본 에이전트로 체험한다.
- OmO Native는 별도 실행 엔진이다. 이 저장소에 적용한 사내 통제를 자동으로 이어받지 않는다.

근거:
- https://registry.npmjs.org/oh-my-openagent/5.1.4
- https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v5.0.0 (OpenCode v2 대응은 준비 중이라고 안내)
- https://github.com/code-yeongyu/oh-my-openagent/issues/8295 (setup/effect 누락 보고)
- https://github.com/code-yeongyu/oh-my-openagent/issues/6169 (이관 논의; 댓글의 외부 포크는 공식 지원과 다름)

기존 플러그인은 새 시험 프로필에 버전을 고정해서 설정한다. 기존 사용자 전역 설정을 자동 복사하지 않는다.
