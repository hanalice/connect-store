# ADR: connect-store AI 导购架构决策

> 状态：已采纳（2026-10-16，v0.4 修订：D6 撤销、新增 D8–D10） | 影响范围：connect-store 项目（Showcase） | 施工文档：`docs/ai-assistant-design.md`（connect-store 内，v0.4） | 历史计划：`~/hermes-agent/.hermes/plans/2026-09-01_104853-connect-store-ai-assistant.md`

---

## 背景（Context）

connect-store 是一个单前端 Vite SPA（React 19 + Vite 8 + 存量 catalog feature，27 测试绿），现要升级为求职主 Showcase，叠加「AI 导购 Agent + HITL 下单审批」。这需要新增一个后端 BFF（流式对话 + 工具执行 + 审批状态机）。升级前需对 5 个关键点做架构决策，本 ADR 记录其结论与完整推理，作为后续调整的溯源基础。

## 决策清单（Decisions）

| #   | 决策点       | 结论                                                                                                                                                            |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 样式方案     | 不引入 Tailwind/shadcn，沿用 SCSS Modules + CSS Variables 设计系统                                                                                              |
| D2  | BFF 框架     | hono                                                                                                                                                            |
| D3  | git 协作     | 开 `feat/ai-assistant` 分支                                                                                                                                     |
| D4  | 模型供应商   | OpenAI-compatible + 环境变量可配（`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `APPROVAL_SECRET`），不锁定单一供应商（v0.4 移除 `EMBEDDING_MODEL`）           |
| D5  | 仓库结构     | `server/` 子目录独立 package.json，**不上 monorepo**                                                                                                            |
| D6  | 语义检索     | ~~BFF 内轻量语义检索（`semanticSearch` 工具）~~ —— **已撤销（2026-10-16）**，理由与替代方案见 D6 节                                                             |
| D7  | 施工文档治理 | `docs/ai-assistant-design.md` 为唯一施工文档；状态机口径以其 §5 为准；历史 plan 降级                                                                            |
| D8  | AI 消息协议  | 前端**自研传输层 + 官方 UI 消息流**（`UIMessageChunk`，`tool-${toolName}` 部件命名）；不采用 `useChat`、不自造事件格式（2026-10-16）                            |
| D9  | HITL 审批    | **分层**：协议层用 SDK 原生 `toolApproval` + `experimental_toolApprovalSecret` 签名；业务状态层自建 BFF 订单表（TTL / expired / 按 orderId 查询）（2026-10-16） |
| D10 | 数据源       | BFF 读**冻结快照**（真实执行过滤逻辑，数据 mock）；dev 经 Vite proxy 与目录页**同源**（2026-10-16）                                                             |

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

**决策**：BFF 使用 OpenAI-compatible 接口，模型通过中性环境变量配置（`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`，均为 OpenAI-compatible 服务，示例端点 `https://api.deepseek.com`），不锁定单一供应商。**v0.4 起移除 `EMBEDDING_MODEL`**（随 D6 撤销，不再需要 embedding 端点），新增 `APPROVAL_SECRET`（审批签名密钥，`openssl rand -base64 32` 生成，与模型供应商无关）。

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

## D6：~~BFF 内轻量语义检索~~ —— **已撤销（2026-10-16）**

**原决策（2026-09-01）**：做语义检索，限定在 BFF 内轻量实现（embedding API + 内存向量 + 余弦 Top-K，Node/TS），不引入向量数据库 / RAG 平台，不做 RAG 数据管道 / 算法侧。原理由：结构化查询覆盖不了「风格 / 场景 / 适用性」类需求；百级商品用内存向量足够。

**撤销理由（2026-10-16，三条）**：

1. **职责边界反转**：2026-10-13 已收敛职责 —— 检索 / 编排层证据由 **newtalk** 承担，本 Showcase 只承担 AI 交互层证据（Generative UI / 状态机投影 / HITL）+ React 底层深度。在 connect-store 再做一套检索 = 重复叙事，削弱而非加强 Showcase。
2. **输入客观缺失**：实测 `Product` 类型仅 `id/creator/title/pricingOption/imagePath/price`，**无 `description` / `tags`**。语义检索连输入字段都没有，须先造 mock 描述才能跑 —— 属"为做而做"，与"设计忌过度工程"相悖。
3. **规模不匹配**：商品为百级、接口一次返回全量数组；结构化过滤（关键词 + 计价方式 + 价格区间 + 排序）已足够覆盖导购需求。

**替代方案（已落入 design v0.4）**：检索收敛为 `searchCatalog` **单通道** —— **语义理解放模型层**（LLM 做 query understanding，把"适合游戏封面的赛博朋克素材"拆成关键词 + 结构化参数），**精确过滤放工具层**（`searchCatalog` 增 `maxPrice` / `minPrice`，在 BFF 快照上真实执行）。**能力边界如实声明**：仅 title/creator 子串匹配，无同义词扩展、无向量召回。

**面试口径（保留价值）**："为什么不做 RAG / 向量检索"本身是加分题 —— 答职责边界 + 输入缺失 + 规模不匹配三条，比硬做一版更能体现架构判断。

---

## D7：施工文档治理（2026-09-01 追加）

**决策**：`docs/ai-assistant-design.md` 为唯一施工文档（v0.4）；状态机以 design §5 的口径为准（**7 主体状态**：idle / thinking / tool_calling / tool_result / streaming / await_human / done，**2 附加态**：error / aborted，合计 **9 节点**；**唯一终态 = done**）；历史 plan（`~/hermes-agent/.hermes/plans/2026-09-01_104853-...`）降级为计划记录，不再作为施工依据。

**理由**：双文档 Phase 编号不一致（7 vs 5）会造成 IDE 执行歧义；唯一文档 + 唯一状态机口径消除歧义。v0.4 补充：状态计数此前是含糊项（图上 8 节点、文中却称"7 状态机"），现明确声明两个数字各自的口径，并新增 `aborted` 态。

---

## D8：AI 消息协议 —— 自研传输层 + 官方 UI 消息流（2026-10-16 追加）

**决策**：前端**不采用** `@ai-sdk/react` 的 `useChat`，改为 `chatApi.ts` **自研传输层**（fetch + 流读取），但**协议走官方 UI 消息流**（`UIMessageChunk`；工具部件命名 `tool-${toolName}`；可用官方 `readUIMessageStream` 助手解析）。**不自定义事件格式。**

**备选**：A. `useChat` + `message.parts`（官方默认路径）；B. 完全自研协议（自造事件枚举）。

**理由**：

- **B 被否**：与本项目既有架构立场「前端消费事件做投影，**不发明协议**」直接冲突；面试必被问"为何不用事实标准"。
- **A 的代价**：Showcase 核心叙事 = "UI 即状态投影 + 事件日志"，`useChat` 会把状态所有权交给 SDK 客户端 hook，状态机不再自主可控；测试确定性也更差。
- **C（本决策）**：协议归官方、状态归自己 —— 拿到两边长处；测试可用**构造 `UIMessageChunk` 受控流**的确定性方式。
- **版本风险隔离（实测依据）**：`ai` 的 5.x / 6.x / 7.x **同日在并行发布**（npm 2026-10-15 三线同时出新，latest = 7.0.142），服务端流式 API 名已变更过（`toDataStreamResponse` → `createUIMessageStreamResponse` + `toUIMessageStream`）→ 与 SDK 的接触面收敛在 `chatApi.ts` + `server/chat.ts` 两处，升级失败可回退自研解析。

**代价**：需自己实现流读取与错误处理（约 100 行量级）；放弃 SDK 客户端便捷能力（重新生成 / 附件等，本项目不需要）。

---

## D9：HITL 审批分层 —— SDK 原生协议 + 自建业务状态（2026-10-16 追加）

**决策**：审批**协议层**用 AI SDK v7 原生 `toolApproval`（含 `experimental_toolApprovalSecret` HMAC 签名）；**业务状态层**自建 BFF 订单表（`pending/approved/rejected/expired` + `issuedAt` + TTL + 按 orderId 查询 + 审计日志）。**不做纯自研审批协议。**

**依据（2026-10-16 实读官方文档，非推测）**：

- SDK v7 原生状态：`'not-applicable' | 'approved' | 'denied' | 'user-approval'`；工具被拦时返回 `tool-approval-request` 而非执行；前端用 `addToolApprovalResponse({ id, approved })` 回应，配 `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`。
- **SDK 不提供（必须自建）**：`edit` 出边、TTL 的签发时刻、按 orderId 查询订单状态、审计日志。
- **签名是安全必需项**：官方文档明确指出，标准模式下服务端不持久化会话、消息历史为**客户端可控输入** → 客户端可伪造一个格式合法的审批**绕过 HITL**；配置签名密钥后才把审批绑定到服务端签发的 toolName + toolCallId + input。这也是 `API-AI-01`（未审批直接下单须被拦截）的官方依据解法。
- **TTL 扩展路径**（置信：中高，**开工前需 30 分钟实测**）：`toolApproval` 返回值不能新增状态名，但审批复放时策略会被 **re-evaluated** → 在回调内查自建签发时刻表，超时即 `return { type: 'denied', reason: 'approval expired' }`（`expired` 语义落在 `denied` + reason 上）。若实测不成立，退回纯自研 pending 队列。

**代价**：审批状态分散在两层（SDK 消息流 + BFF 订单表），需明确"谁说了算"。口径：**协议看 SDK 流，业务看订单表，签名保证两者不可被客户端伪造。**

---

## D10：数据源 —— BFF 冻结快照 + dev 同源（2026-10-16 追加）

**决策**：BFF 工具读**冻结快照**（远程 `/api/data` 的一次导出，全量数组），在快照上**真实执行**筛选 / 排序 / 价格区间过滤（数据 mock、逻辑真跑）；dev 环境在 `vite.config.ts` 加一条 proxy，把该 URL 代理到 BFF 的同一份快照，使**目录页与 AI 推荐同源**。

**理由**：

- **确定性**：LLM 场景的测试与演示必须可复现；远程接口（Azure）可能慢 / 挂 / 数据变动。
- **演示一致性**：若目录页走远程实时、BFF 走快照，会出现"AI 推荐的商品在目录页找不到 / 价格不一致"，面试现场一搜即露。
- **改动面小**：`productApi.ts` 一个常量 + proxy 一条规则，不动任何组件。

**代价**：快照会与线上数据逐渐漂移（README 与演示话术中须标注"快照为演示数据，导出日期 X"）；若要"实时"，需再引入缓存层（当前不做，避免过度工程）。

---

## 后果与权衡（Consequences）

- **正面**：结构简单、部署清晰（静态前端 + 无状态 BFF 分离）、面试叙事有「克制」的架构判断。
- **负面**：若未来 Showcase 扩展出第 3、4 个共享模块的包，需重新评估是否迁移 monorepo——迁移成本届时递增，故本 ADR 需在「新增第 3 个包」时强制复审。
- **v0.4 新增负面**：决策面从 7 条扩到 10 条，其中 D6 被撤销 —— 这正是本 ADR 的用法：**拍板 = 可复审**，每次修订保留原决策与撤销理由，供面试溯源"为什么改"（这比"一开始就全对"更可信）。
