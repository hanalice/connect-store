# Connect Store

AI shopping assistant with human-in-the-loop (HITL) order approval on a performant React catalog. Ask naturally — the agent searches, adds to cart, proposes an order; you approve, reject, or edit first.

<!--
讲述大纲（≤300s）
1 Features 45s：口语购物；工具=检索/详情/加购/下单；三出边 approve/reject(AI 重规划)/edit；TTL 300s+HMAC 双拦截。
2 Architecture 50s：前端 FSM 只投影；BFF 独握 Key；审批两层=SDK toolApproval+内存订单表。
3 Tech 35s：React 19+TS7+Vite8+Zustand persist/Hono+ai@7/Vitest+RTL+Playwright。
4 HITL 60s：对话→推荐→加购→下单(await_human)→审批→订单号；超 TTL 300s 惰性过期、伪造被 HMAC 拦；亮点=reject 理由回流。
5 Testing 40s：根 137(20 文件~6s)/server 72(9 文件~2s)/E2E mock 23 条(~26s)；live 手动不进 CI。
6 Deploy 30s：push main→Pages 静态；workflow_dispatch 手动；BFF 常驻无部署步骤。
-->

## Features

- **AI chat** — natural-language shopping ("games under $20") streamed from an LLM; the catalog is its toolbox.
- **Tool loop** — `searchCatalog` (keyword/pricing/sort/price range), `getProductDetails`, `addToCart`, `placeOrder`, live in a tool-call panel; a whitelist registry renders results as product cards.
- **HITL approval** — no human click, no execution: approve, reject (AI re-plans with your reason), or edit (re-enters approval); pending dies after a 300s TTL, forged fails HMAC at the BFF.
- **Catalog base** — `IntersectionObserver` infinite scroll, URL-synced search/filters, deterministic priority sorting.

## Architecture

```txt
Frontend (React 19 · TS 7 · Vite 8 · Zustand)
 ChatPanel · ToolCallPanel · ApprovalCard
 assistantMachine (FSM) · useCartStore (persist)
   │ POST /api/chat (official UI message stream)
BFF (Hono · AI SDK v7); LLM_API_KEY stays server-side
 tools: searchCatalog · getProductDetails ·
 addToCart · placeOrder
 approval two layers: SDK toolApproval + HMAC;
 order table in memory (TTL 300s · by orderId)
   └→ LLM API
```

The frontend projects the official UI message stream — no invented protocols; `/api` proxies to the BFF in dev. [Design](docs/ai-assistant-design.md).

## Tech Stack

| Frontend                   | Server (BFF)       |
| -------------------------- | ------------------ |
| React 19 · TS 7 · Vite 8   | Hono (Node)        |
| Zustand (persist cart)     | AI SDK v7 (`ai@7`) |
| React Router 7 · SCSS Mod. | tsx · Vitest       |

Testing: Vitest, Testing Library, Playwright. Gates: ESLint, Prettier, Husky, Commitlint.

## HITL Flow

1. **Chat** — user asks; the LLM streams back.
2. **Recommend** — `searchCatalog` renders product cards.
3. **Add to cart** — `addToCart` fills the persistent cart drawer.
4. **Propose** — `placeOrder` pauses at `await_human`; ApprovalCard shows items, quantities, total.
5. **Decide** — approve → `POST /api/orders` returns an order number; reject (reason → AI re-plans); edit → re-enters approval.
6. **Confirm** — conversation resumes with the order id.

Stale `pending` approvals lazily expire past the 300s TTL; unsigned payloads are refused at the BFF.

## Testing

Per [docs/regression-index.md](docs/regression-index.md) §1:

| Layer       | Command                 | Size                         | Gate           |
| ----------- | ----------------------- | ---------------------------- | -------------- |
| Unit+integ. | `npm test`              | 20 files / 137 cases (~6s)   | pre-commit     |
| BFF unit    | `cd server && npm test` | 9 files / 72 cases (~2s)     | pre-commit, CI |
| E2E (mock)  | `npm run test:e2e`      | 23 cases E2E-AI-01~24 (~26s) | CI             |

Live smoke `npm run test:e2e:live` (after `npm run dev:bff`) — E2E-AI-09, manual, not in CI. pre-commit: lint, format:check, both suites; CI adds build, BFF typecheck, mock E2E.

## Deployment

- **CI** (`ci.yml`, push/PR): lint → format → tests → build → BFF typecheck → mock E2E.
- **Deploy** (`deploy.yml`): push `main` → GitHub Pages (`dist/`); `workflow_dispatch` reruns manually. Pages is the only target; the BFF deploys separately (no step here).
- **Local**: `npm run dev` (Vite :5173) + `npm run dev:bff` (Hono :8787, 2nd terminal); `npm run build` type-checks and bundles.
