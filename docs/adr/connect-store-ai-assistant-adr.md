# ADR: connect-store AI 导购架构决策

> 状态：已采纳（2026-09-01，v0.3 修订） | 影响范围：connect-store 项目（Showcase） | 施工文档：`docs/ai-assistant-design.md`（connect-store 内） | 历史计划：`.hermes/plans/2026-09-01_104853-connect-store-ai-assistant.md`

---

## 背景（Context）

connect-store 是一个单前端 Vite SPA（React 19 + Vite 8 + 存量 catalog feature，27 测试绿），现要升级为求职主 Showcase，叠加「AI 导购 Agent + HITL 下单审批」。这需要新增一个后端 BFF（流式对话 + 工具执行 + 审批状态机）。升级前需对 5 个关键点做架构决策，本 ADR 记录其结论与完整推理，作为后续调整的溯源基础。

## 决策清单（Decisions）

| #   | 决策点       | 结论                                                                                                                          |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | 样式方案     | 不引入 Tailwind/shadcn，沿用 SCSS Modules + CSS Variables 设计系统                                                            |
| D2  | BFF 框架     | hono                                                                                                                          |
| D3  | git 协作     | 开 `feat/ai-assistant` 分支                                                                                                   |
| D4  | 模型供应商   | OpenAI-compatible + 环境变量可配（`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `EMBEDDING_MODEL`），不锁定单一供应商        |
| D5  | 仓库结构     | `server/` 子目录独立 package.json，**不上 monorepo**                                                                          |
| D6  | 语义检索     | BFF 内轻量语义检索（embedding + 内存向量 + 余弦 Top-K）作为 `semanticSearch` 工具；不引向量库/RAG 平台（2026-09-01 拍板：做） |
| D7  | 施工文档治理 | `docs/ai-assistant-design.md` 为唯一施工文档；7 状态机为准；历史 plan 降级                                                    |

---

## D1：不引入 Tailwind/shadcn

**决策**：沿用 connect-store 存量 SCSS Modules + CSS Variables 设计系统，白名单组件（ProductCard/OrderSummary 等）复用 catalog 视觉。

**理由**：

- 存量项目已有一套完整设计系统（CSS Custom Properties 主题 + SCSS Modules），引入 Tailwind 会形成**双样式体系**，维护成本翻倍。
- 面试叙事更优：讲「存量设计系统 + 组件白名单」比「我用了 Tailwind」更有架构厚度——前者体现对既有系统的评估与渐进集成能力。

**代价**：放弃 shadcn 的现成组件生态（需自行实现少量 UI 组件）。可接受，因白名单组件数量少（4 个）。

---

## D2：BFF 用 hono

**决策**：BFF 采用 hono（轻量 TS 优先 Web 框架）。

**备选**：极简原生 `http`（零依赖）、Express。

**理由**：

- hono 路由简洁、TS 类型友好（请求/响应可推导），适合「3 个端点 + 工具执行」的轻量 BFF。
- 相比原生 http，省去手写路由匹配/body 解析样板；相比 Express，体积更小、类型更好、无历史包袱。
- 不引入 Fastify/Nest 等重型框架——BFF 职责单一（流式对话 + 审批状态机），不需要 DI/模块系统。

**代价**：团队若有 Express 既有经验需短暂适应，本项目无此负担。

---

## D3：开 feat 分支

**决策**：在 `feat/ai-assistant` 分支开发，PR 流程合并。

**理由**：符合工程叙事（面试讲「feature branch + PR + CI 门禁」是加分项）；与存量项目已有 GitHub Actions CI 衔接；便于 `git log -p` 审查增量。

---

## D4：模型供应商可配

**决策**：BFF 使用 OpenAI-compatible 接口，模型与 embedding 通过中性环境变量配置（`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `EMBEDDING_MODEL`，均为 OpenAI-compatible 服务，示例端点 `https://api.deepseek.com`），不锁定单一供应商。**LLM 与 embedding 共用同一 API Key**（同供应商同 key 鉴权），`EMBEDDING_MODEL` 仅用于选模型名，不需要独立 key。

**理由**：对齐用户「BFF Streaming / 多模型路由 / 降级」的既有经验——多模型可配本身就是面试要讲的 BFF 架构能力，而非限制。

---

## D5：不上 monorepo，用 server/ 子目录

### 决策

`server/` 子目录独立 package.json，**不引入 monorepo**（不声明 npm/pnpm workspaces，不用 turbo/nx）。前端 dev 用 Vite proxy 把 `/api` 转发给 BFF，根 package.json 可选加 convenience 脚本协调双进程启动。

### 判据（正确因果，非「包数」）

monorepo 的价值在于解决**四类收益**，逐条对照本场景：

| 收益维度               | 它解决什么                                         | 本场景是否成立                                                   |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| 1. 依赖/代码共享       | 多包有共享模块，改一次多处生效，避免复制与版本漂移 | ❌ 前端（React/Zustand/Vite）与 BFF（hono/ai/zod）依赖几乎零重叠 |
| 2. 跨包变更原子性      | 改共享模块需同步改 N 个消费方，一个 PR 原子提交    | ❌ 无共享模块，不存在「改一处要同步多处」                        |
| 3. 构建编排 + 增量缓存 | 包多、链路长时做依赖拓扑 + 分布式缓存              | ❌ 两端本就独立构建，无拓扑关系                                  |
| 4. 原子发布            | 多包必须同版本一起上线                             | ❌ 前端静态产物（GitHub Pages）与 BFF 常驻进程部署节奏不同       |

**结论**：四类收益全部不成立 → 不上 monorepo。判据不是「包少」，而是「收益为零」。

### 唯一共享面：Product 类型

BFF 的 `search_catalog` 工具返回商品、前端 `ProductCard` 渲染商品，两端都需知道 `Product` 字段结构（`id/creator/title/pricingOption/imagePath/price`）。

**但这不是上 monorepo 的理由**，因为：

1. 该类型是「存量稳定 + 只读消费」，字段由外部远程 API 决定，不是高频改动、需双向同步的开发热点。
2. 共享一个 interface 的正确解法是**契约**，不是物理共享：两端各自定义 `Product`，BFF 侧用 **Zod schema 运行时校验**，保证「BFF 吐出的、前端收到的一定合法」。这比 workspace 共享更稳——共享靠运行时校验兜底，而非「同一个源文件」。

这也正是面试 Generative UI「Schema 校验」那一环的核心：**跨端类型一致性靠 schema 校验契约，不靠代码物理共享**。

### 落地形式

```
connect-store/
├── package.json          # 前端（不动）
├── src/                  # 前端（不动）
├── server/               # BFF 独立 package
│   ├── package.json      # ai / hono / zod / dotenv
│   ├── .env.example
│   ├── tsconfig.json
│   └── src/
├── .gitignore            # 追加 server/node_modules、server/.env
└── package.json          # 可选 convenience 脚本，不声明 workspaces
```

### 边界（何时 2 包也该上 monorepo）

反例：若两包共享面大（`Product` 类型前后端频繁同步改、一套 Zod schema 两端复用、设计 token 跨端复用），则即使只有 2 包也值得 workspace——因为「改一处要同步多处」这条收益成立了。判据始终是**收益维度是否成立**，而非包数。

---

## D6：BFF 内轻量语义检索（2026-09-01 追加）

**决策**：做语义检索，但限定在 BFF 内轻量实现（embedding API + 内存向量 + 余弦 Top-K，Node/TS），不引入向量数据库 / RAG 平台（Pinecone/Chroma/Qdrant），不做 RAG 数据管道/算法侧。

**理由**：

- 导购推荐需要依据：纯结构化查询（价格/免费/排序）覆盖不了「风格/场景/适用性」类需求（如「赛博朋克、适合游戏封面」），无检索则推荐无据。
- 规模匹配：商品量级（百级）用内存向量足够，向量数据库是过度设计。
- 边界保留：数据管道（清洗/分块/重排）仍是后端团队职责；本 Showcase 只做「前端/BFF 如何消费检索结果」的架构叙事（对齐 Coupang 面试口径）。
- 诚实标注：embedding 不可用（如 DeepSeek 无 embedding 端点）时降级 BM25，如实标注质量差异。

---

## D7：施工文档治理（2026-09-01 追加）

**决策**：`docs/ai-assistant-design.md` 为唯一施工文档（v0.3 定稿）；状态机以 7 状态（idle→thinking→tool_calling→tool_result→streaming→await_human→done/error）为准；历史 plan（`.hermes/plans/2026-09-01_104853-...`）降级为计划记录，不再作为施工依据。

**理由**：双文档 Phase 编号不一致（7 vs 5）会造成 IDE 执行歧义；唯一文档 + 唯一状态机口径消除歧义。

---

## 后果与权衡（Consequences）

- **正面**：结构简单、部署清晰（静态前端 + 无状态 BFF 分离）、面试叙事有「克制」的架构判断。
- **负面**：若未来 Showcase 扩展出第 3、4 个共享模块的包，需重新评估是否迁移 monorepo——迁移成本届时递增，故本 ADR 需在「新增第 3 个包」时强制复审。
