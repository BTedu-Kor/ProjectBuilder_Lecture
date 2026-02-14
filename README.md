# 대화 리허설 + 공감 코칭 MVP (Cloudflare Pages Functions + D1)

정적 사이트(`index.html`, `main.js`, `style.css`) 구조를 유지하면서, Pages Functions + D1 기반 API를 추가한 MVP입니다.

## 주요 기능
- `#/setup`: 대화 유형/상대 프로필 설정
- `#/chat`: 리허설 채팅 + 타임머신 패널(공감형/단호형/짧게)
- `#/report`: 대화 로그 기반 리포트 요청 생성(기본 저장 OFF)
- 서버 강제 무료 턴 제한: `clientId + dayKey(Asia/Seoul)`

## D1 마이그레이션
- 원격 적용:
`npx wrangler d1 migrations apply YOUR_DATABASE_NAME --remote`
- 로컬 적용:
`npx wrangler d1 migrations apply YOUR_DATABASE_NAME --local`

## 로컬 실행
`npx wrangler pages dev .`

필요하면 D1/환경변수를 함께 지정해서 실행하세요.

## Cloudflare Pages 배포 설정
- Build command: `exit 0`
- Build output directory: `/` (정적 루트)
- D1 Binding 추가:
  - Binding name: `DB`
  - Database: 생성한 D1 연결
- Environment Variables 추가:
  - `OPENAI_API_KEY` = OpenAI API Key
  - (선택) `FREE_TURN_LIMIT` = 일일 무료 턴 수 (기본 20)
  - (선택) `OPENAI_MODEL` = 기본 `gpt-4.1-mini`
  - (선택) `HEALTHCHECK_TOKEN` = `/api/health` 보호 토큰

## API
- `POST /api/chat`
- `POST /api/report`
- `GET /api/health` (선택 토큰: `x-health-token` 헤더 또는 `?token=...`)

`/api/chat`, `/api/report`는 OpenAI 쿼터(429)일 때 로컬 임시 코칭/리포트로 자동 폴백합니다.

두 API 모두 아래 응답 스키마를 사용합니다.

```json
{
  "personaReply": "string",
  "emotionGuess": ["..."],
  "needsGuess": ["..."],
  "rewriteSuggestions": [
    {"label":"공감형","text":"..."},
    {"label":"단호형","text":"..."},
    {"label":"짧게","text":"..."}
  ],
  "safetyFlags": [],
  "usage": {
    "limit": 20,
    "used": 3,
    "remaining": 17,
    "dayKey": "YYYY-MM-DD"
  }
}
```
