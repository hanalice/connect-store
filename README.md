# Connect Store

A professional-grade digital asset catalog platform built with a focus on performance, scalability, and maintainability.

## 🌟 Key Features

- **Performance-Optimized Rendering**: Implements highly efficient infinite scrolling using `IntersectionObserver` to ensure smooth content discovery.
- **State-Managed Filtering & Search**: Advanced catalog management featuring debounced real-time search and multi-criteria filtering, fully synchronized with URL state for persistent navigation.
- **Advanced Sorting Logic**: Features a categorical priority sorting engine (Paid > Free > View Only) with deterministic alphabetical fallback for consistent data presentation.
- **Architectural UI Consistency**: Utilizes precision-matched Skeleton components to eliminate Cumulative Layout Shift (CLS) during asynchronous data loading.
- **Robust Design System**: Implements a theme-aware architecture using CSS Custom Properties, supporting system-level theme detection and persistence.
- **Production-Ready CI/CD**: Integrated with automated workflows for type-checking, linting, unit testing, and continuous deployment.

## 🛠 Technical Stack

- **Framework**: React 19 + TypeScript
- **State Management**: Zustand
- **Routing**: React Router 7
- **Styling**: SCSS Modules + CSS Variables (Design Tokens)
- **Testing**: Vitest + React Testing Library
- **Code Quality**: ESLint, Prettier, Husky, Commitlint
- **Build Infrastructure**: Vite 8 (+ GitHub Actions for CI/CD)

## ⚖️ Quality Assurance & Testing

We maintain a high standard of quality with 100% test coverage for core business logic and critical UI interactions.

- **[Execution Report](docs/qa_report.md)**: View the latest test results, pass rates, and bug fix verifications.
- **[Test Case Design](docs/test_cases.md)**: Deep dive into our test strategies, coverage mapping, and integration scenarios.

## 🚀 Development Lifecycle

- `npm run dev`: 启动前端（Vite，默认 5173）
- `npm run dev:bff`: 启动 BFF（`server/`，Hono，默认 8787）。需另开终端，与前端同时运行
- `npm run build`: Type-check and build production assets
- `npm run preview`: Preview production build
- `npm run test`: Execution of test suites (unit/integration)
- `npm run lint`: Static analysis and linting
- `npm run format`: Code formatting

## 📂 Architecture Overview

仓库里是两个独立应用：前端静态站点，以及 `server/` 下的 BFF。商品目录仍由浏览器直接请求公开 API；对话走 Vite 开发代理，把 `/api` 转到 BFF。根目录与 `server/` 各有一份 `ai` 依赖（前端只用来解析 UI 消息流），升级时两边一起改。审批 TTL 实验脚本 `server/ttl-approval-experiment.mjs` 单独执行（`npm --prefix server run test:ttl`），不进 CI。

```txt
src/              # 前端 SPA
├── app/          # Global configuration and routing
├── features/     # Domain-specific logic (Catalog、Assistant)
├── styles/       # Global styling and design tokens
└── test/         # Testing infrastructure
server/           # BFF（独立 package：connect-store-bff）
├── index.ts      # Hono 入口，默认端口 8787
├── chat.ts       # POST /api/chat
└── env.ts        # LLM 与端口配置
```
