# 식품 제조 AI 워크벤치

가상의 식품회사 데이터로 **생산기술 · 품질관리 · 품질보증** 업무를 AI로 돕는 로컬 웹 서비스.
상단에서 직무를 고르면 그 직무의 업무 흐름과 AI 도구만 보인다. "전체"에서는 세 직무를 비교한다.

| 직무 | 도구 | 역할 분담 |
|---|---|---|
| 생산기술 | 생산지표 분석·보고서 | 통계·이상치 탐지는 **코드**, 원인 가설·보고서는 AI |
| 생산기술 | 설비 이상 진단 | 기준선 이탈·고장 전조 탐지는 **코드**, 정비 계획·경보 기준 제안은 AI |
| 품질관리 | 검사 데이터 이상 탐지 | 관리도·Cpk·추세 계산은 **코드**, 이상 해석·조치 제안은 AI |
| 품질관리 | 부적합 보고서 초안 | 메모 인용을 **코드**가 원문과 대조, 메모에 없는 정보는 AI가 되물음 |
| 품질관리 | 법규 개정 영향도 분석 | AI가 인용한 조문을 **코드**가 원문과 대조 |
| 품질보증 | 클레임 분류·회신 초안 | 분류·조사 항목·회신 초안은 AI |
| 품질보증 | 협력업체 통보서 초안 | 메모 인용·업체 과거 이력은 **코드**가 대조, 책임 단정 표현은 코드가 경고 |

## 실행

1. Node.js 20+ 설치, `npm install`
2. **Claude 로그인 (최초 1회, API 키 불필요)**
   ```
   node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe auth login
   ```
   데스크톱 앱 안에서 돌리는 세션의 인증은 별도 Node 프로세스에서 쓸 수 없으므로 이 로그인이 필요하다.
3. 터미널 두 개에서 각각 실행 후 http://localhost:5173
   ```
   npm run dev:server
   npm run dev:web
   ```
4. 인증 확인: `npm run poc:llm` (구조화 JSON이 오면 성공)
   실제 Claude로 도구 점검: `npm run live:check -- production|equipment|inspection|ncr|supplier|regulation|claim`

같은 와이파이의 다른 기기(폰·노트북)에서 보려면 `npm run dev:web`을 켠 PC의 IP로 접속한다.
`http://<PC의 와이파이 IP>:5173` (PC에서 `ipconfig`로 확인. IP는 공유기에 따라 바뀔 수 있다.)
접속이 안 되면 윈도우 방화벽에서 Node.js 허용 여부와 공유기의 기기 간 격리(AP isolation) 설정을 확인한다.

### 링크로 어디서든 열기 (Claude 아티팩트)

서버 없이 도는 단일 HTML로 만들어 claude.ai 아티팩트로 게시할 수 있다. 같은 도구 코드(`src/server/core.ts`)를 브라우저에서 돌리고, 데이터는 페이지에 내장한다.

| 입력 | AI 응답 | 숫자 계산·검증 |
|---|---|---|
| 샘플(33건) | 미리 실행해 둔 **실제 Claude 응답**(`src/static/recordings.json`) | 지금 화면에서 다시 계산 |
| 직접 입력 | 뷰어가 Claude 사용을 허용하면 그 자리에서 분석, 아니면 안내 | 지금 화면에서 계산 |

```
npm run record:artifact   # 샘플마다 실제 Claude로 한 번씩 돌려 기록 (이미 기록된 질문은 건너뜀, --fresh로 처음부터)
npm run build:artifact    # dist-artifact/artifact.html 생성
python scripts/scan-artifact.py   # 게시 전 개인정보·키 검사
npm run preview:artifact  # 로컬에서 미리 보기 (http://localhost:4173)
```

도구나 프롬프트를 바꾸면 질문이 달라져 기록이 맞지 않으니 `record:artifact`를 다시 돌려야 한다(테스트가 어긋나면 알려 준다).

로그인 없이 화면만 보려면 `npm run dev:demo` (서버 대신 실행). 상단에 "데모 모드" 배너가 뜨며 **가짜 응답**이다.

## 구조

```
src/server/domain       도메인 모델, 시드 스키마, 통계(stats.ts)
src/server/application  LlmClient 포트, generateStructured, 도구 3종(tools.ts)
src/server/infra        ClaudeAgentLlmClient, FakeLlmClient, JsonStore, SeedRepo
src/server/app.ts       HTTP API (createApp: LLM 주입)
src/web                 React UI
seed/                   가상 데이터 (생산 CSV, 품목, 법규, 클레임)
../sample-data/data/    유가공·육가공 가상 CSV (설비 센서, 생산 실적). 설명은 ../sample-data/README.md
```

- Claude 호출은 `settingSources: []`, `tools: []`로 격리한 순수 텍스트 호출이다.
- 출력은 zod 스키마로 강제하고, 불일치 시 오류 내용을 붙여 1회 재시도한다.
- `npm test`, `npm run typecheck`

## 한계

- 모든 데이터와 법규 조문은 **가상**이다. 실제 법령·실제 회사 데이터가 아니다.
- AI 결과는 초안이다. 최종 판단은 담당자가 한다.
- CSV 형식이 다르면 필요한 컬럼을 안내한다. 업로드는 5MB까지.
