## AI Assistant TODO List

> 本清单是 `docs/ai-assistant-design.md` §10 的**细化执行版**，是 IDE 施工的唯一任务依据（`docs/ai-assistant-design.md` 整体为唯一施工文档）。
> **拆分原则**：每个任务都是「前后端一起」的端到端最小交付（如 G1 流式对话 = BFF 端点 + 前端面板一起验收），不做「先做完全部后端再做前端」的整层交付。
> **任务粒度**：0.5~2 天一个，完成即可独立验证。
> **任务状态**：`todo`（未做）/ `done`（完成）；完成后勾选并 git 提交。
> **提交纪律（本仓库实测）**：pre-commit hook = `npm run lint` + `npm run format:check` + `npm test`。**未格式化的文件会卡住任何提交（含 docs 改动）** → 提交前先 `npx prettier --write <改动的文件>`；三件套全绿才 `git commit`，不要用 `--no-verify` 绕过。
> **编号体系**：`G<Phase>.<序号>`；每个目标（G0-G4）指向其解决的面试问题与市场依据。
> **排期**：见「施工顺序与排期（2026-10-13 定）」——**硬约束 = 不占用求职 P0 时段**（P0 未收口则顺延）。

### 目标总览（编号 + 指向）

| 目标 | 一句话目标                                   | 指向（面试问题 / 市场依据）                                              | 补充信息 | 排期                               |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------ | -------- | ---------------------------------- |
| G0   | TS 7.0 升级 + 迁移实测                       | Day 3 TS7 话术卡（真实项目迁移数字）                                     | 约 1 天  | **W10-12**（10-15，与 Day 4 合并） |
| G1   | 流式对话骨架（端到端切片）                   | 08-08 补考「Streaming UI」子问题；8/31 发现③ AI SDK 2,356 万/周          | 约 2 天  | **W10-19**（10-19 ~ 10-23）        |
| G2   | 工具调用 + 状态机 + Generative UI + 语义检索 | 08-08 补考「工具回路 / 状态机投影 / Generative UI 安全」子问题；阿里 #40 | 约 4 天  | **W10-19 ~ W10-26**（G2.2 可提前） |
| G3   | HITL 下单审批（Showcase 核心）               | 08-08 补考「HITL 三条出边」核心子问题                                    | 约 3 天  | **W10-26 ~ W11-02**                |
| G4   | 收尾：测试 / 文档 / story                    | 08-20 Vitest 材料；README 5 分钟面试演练                                 | 约 2 天  | **W11-02**（11-05 ~ 11-06）        |

---

## 施工顺序与排期（2026-10-13 定）

> **决策依据**：用户确认「React 深度 + AI 能力两者都要」，G0–G4 全量做。本项目职责 = **React 底层深度 + AI 交互层证据**（Generative UI / 状态机投影 / HITL）；**不**承担检索 / 编排层证据（RAG、混合检索、多 Agent 编排由 newtalk 承担，避免重复叙事）。见 `~/hermes-agent/career-path/strategy-note.md` §3 / §4②。
>
> **硬约束（优先级高于本表）**：求职 **P0 = 三项目答辩深度提炼 + 追问预案**，直接决定面试通过率。**P0 未收口则 G1 顺延**，不允许用本项目的工程时间置换 P0 时段。

### 依赖顺序（不跳步）

```
G0（TS7 迁移）──► G1（BFF 骨架 + 流式）──► G2（工具 / 状态机 / Generative UI / 语义检索）──► G3（HITL 审批）──► G4（测试 / 文档 / README）
                      ▲
                      └── G2.2 状态机是「前端纯函数、零依赖」→ 可提前到任何空档，立刻产出单测 + React 深度素材
```

- **G1 是 G2 / G3 的前置**：没有 BFF 骨架与 SSE 通道，工具调用与审批没有落点。
- **G3 依赖 G2 的工具契约**：`placeOrder` 必须挂在工具回路与状态机上，否则三出边无处触发。
- **G4 依赖 G1–G3 全部完成**：测试矩阵与 README story 要引用真实实现，不能先写。
- **唯一可提前项 = G2.2**（纯函数状态机 + 转换表）：不依赖 BFF，可与 G0/G1 并行。

### 周排期

| 周次               | 日期                  | 任务                                                                     | 交付物 / 验收                                                                                                                      |
| :----------------- | :-------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **W10-12**（本周） | **10-15（Day 4）**    | **G0.2 + G0.3** —— 与周计划 Day 4 的 `tsc --noEmit` 7.x 实测**合并交付** | `docs/ts7-migration.md`：含仓库 LOC / 机器 / 冷热缓存 / `--incremental` / 单线程开关**口径声明** + 报错分类；同时作为 Day 4 交付物 |
|                    | 10-16 ~ 10-18（空档） | **G2.2**（可提前项）—— 纯函数状态机 + 转换表驱动单测                     | `assistantMachine.ts` + ≥6 条路径全绿，测试 27 → ≥33                                                                               |
| **W10-19**         | 10-19 ~ 10-20         | G1.1 / G1.2（BFF 初始化 + 流式端点）                                     | `npm run dev` 起服务；`curl /health` 200；`curl -N /api/chat` 流式完整（含 finish 事件）                                           |
|                    | 10-21 ~ 10-23         | G1.3 / G1.4 + G2.1（前端对话切片 + 错误处理 + 工具定义）                 | 浏览器流式打字机渲染；断网 / 停 BFF 不白屏；curl 逐工具验证（非法输入 → Zod 报错）                                                 |
| **W10-26**         | 10-26 ~ 10-27         | G2.3 / G2.4（工具端到端 + Generative UI registry）                       | 对话触发 `searchCatalog` → 工具卡实时显示；未知组件 id → fallback 单测过                                                           |
|                    | 10-28 ~ 10-30         | G2.5 / G3.1（语义检索 + 购物车切片）                                     | 语义召回正确（「赛博朋克 / 游戏封面」）；embedding 不可用 → BM25 降级**如实标注**；加购 / 删改 / 合计正确                          |
| **W11-02**         | 11-02 ~ 11-04         | G3.2 / G3.3 / G3.4（审批后端 + 前端 + 失败恢复）                         | 端到端闭环：对话 → 推荐 → 加购 → 下单 → 审批 → 订单号；reject 后 AI 修正链路跑通                                                   |
|                    | 11-05 ~ 11-06         | G4.1 ~ G4.4（测试矩阵 / README story / 文档 / 验收）                     | 总测试 **≥37 全绿** + CI 通过；README 5 分钟可讲完；wiki 增补 AI 导购节                                                            |

**总计约 11 个工作日 + 缓冲**：10-15 零散启动（G0 + G2.2），10-19 起因 P0 收口转入连续施工，预计 **11-06 前**完成 G0–G4。

### 排期的滑动规则

- 本表**只在「不影响 P0」的前提下滑动**；每周一由 `interview-plan.md` 复排时同步校准。
- 每完成一个 G：勾选本文件任务状态 + `git commit`（commit message 记口径与数字来源）。
- 全部收口后回写两处：`~/hermes-agent/career-path/strategy-note.md` §4②（排期状态）+ wiki `connect-store-architecture.md`（追加 AI 导购节，保留旧内容）。

---

### 任务详情

| 任务 | 状态 | 任务描述                                                                                                                                                      | 完成标准                                                                                               |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| G0.1 | done | 建 `feat/ai-assistant` 分支（✅ 2026-09-01 已建，为当前分支）                                                                                                 | `git branch` 显示在 feat/ai-assistant；工作区干净                                                      |
| G0.2 | todo | `npm i -D typescript@^7`，适配 tsconfig/eslint(typescript-eslint)/vitest/@types/node                                                                          | `tsc -b` 全绿；`npm run build` 通过；`npm test` **27 通过不回归**                                      |
| G0.3 | todo | 记录 TS7 迁移实测（安装/构建/类型检查耗时前后对比 + 报错分类），落盘 `docs/ts7-migration.md`                                                                  | 文档含可引用数字（带单位和推导链，不编造）；测试仍 27 绿                                               |
| G1.1 | todo | BFF 工程初始化：`server/` 目录（hono + ai + zod + dotenv + env.ts 用 LLM\_\* 变量）+ `GET /health` + 前端 Vite proxy `/api` → BFF                             | `npm run dev` 起服务；`curl /health` 200；前端 dev 环境 `/api` 可达 BFF                                |
| G1.2 | todo | 后端流式端点：`POST /api/chat` → `ai.streamText`（无工具，SSE 输出）                                                                                          | `curl -N` 流式输出完整（含 finish 事件）                                                               |
| G1.3 | todo | 前端对话切片：`/assistant` 路由 + `ChatPanel` + `StreamingText`（打字机）+ `chatApi`（SSE 客户端）                                                            | 浏览器问「推荐免费的素材」→ 流式回复完整渲染                                                           |
| G1.4 | todo | 切片验收：错误处理（网络断 / 500）+ 手动走查                                                                                                                  | 断网/停 BFF 不白屏、提示明确；`npm test` 仍 27 绿                                                      |
| G2.1 | todo | 工具定义（BFF）：`searchCatalog` / `getProductDetails` / `addToCart` / `semanticSearch`（Zod schema 校验输出，复用 Azure API 或本地快照）                     | curl 逐工具验证（含非法输入 → Zod 明确报错）                                                           |
| G2.2 | todo | 状态机（前端纯函数）：`assistantMachine` 7 状态（idle→thinking→tool_calling→tool_result→streaming→await_human→done/error）+ 事件日志（环形缓冲 200 条）       | 转换表单测 **≥6 条路径**全绿 + 非法转换拒绝                                                            |
| G2.3 | todo | 工具调用端到端切片：`/api/chat` 接入 tools + `useAssistantStore` + `ToolCallPanel`（工具名/参数/状态/耗时）                                                   | 对话触发 `searchCatalog` → 面板实时显示工具卡；状态投影正确                                            |
| G2.4 | todo | Generative UI 切片：`uiRegistry` 白名单（ProductCard/OrderSummary/PriceBreakdown/EmptyRecommendation）+ schema 校验 + 模型返回组件标识                        | 推荐商品渲染真实 ProductCard（非纯文本）；「未知组件 id → fallback 文本」「非法 props → 截断」单测通过 |
| G2.5 | todo | 语义检索切片：`retrieval/`（embed + 内存向量 + 余弦 Top-K + buildIndex）+ `semanticSearch` 工具接线 + embedding 不可用降级 BM25                               | 「赛博朋克 / 适合游戏封面」能召回正确商品；降级路径如实标注（不假装完美）                              |
| G3.1 | todo | 购物车切片：`useCartStore`（Zustand + persist）+ `CartDrawer` + `addToCart` 工具前端接线                                                                      | 浏览器加购/删改/合计正确；单测 CRUD + persist 恢复                                                     |
| G3.2 | todo | 审批后端切片：`placeOrder` 工具（返回 `{orderId, requiresApproval:true}` 不直接执行）+ `ApprovalStore`（内存 Map + TTL 5min 过期）+ `POST /api/orders` 三出边 | curl 走通 pending → approve / reject / edit；过期 → expired                                            |
| G3.3 | todo | 审批前端切片：`ApprovalCard`（订单摘要 + 三按钮）+ `await_human` 状态投影 + 端到端闭环                                                                        | 浏览器完整闭环：对话→推荐→加购→下单→审批→订单号；reject 后 AI 修正链路跑通                             |
| G3.4 | todo | 失败恢复切片：error/abort 态 + 重试按钮 + 降级提示（「可回目录手动选购」）                                                                                    | 断网/停 BFF 不白屏、可恢复；单测覆盖 error→idle 转换                                                   |
| G4.1 | todo | 测试矩阵补全：registry 4 类用例 + 状态转换表 + mock LLM 确定性（`vi.mock('ai')`）+ approval 协议测试 + ChatPanel 集成测试                                     | **总测试 ≥37 全绿**；CI（GitHub Actions）通过                                                          |
| G4.2 | todo | README 升级为 5 分钟 story（对齐 vercel/ai-chatbot：特性/架构图/技术栈/HITL 流程/测试/部署）                                                                  | README 可在 5 分钟内讲完（面试演练）                                                                   |
| G4.3 | todo | 设计文档最终版（含 mermaid 架构图）+ wiki `connect-store-architecture.md`追加 AI 导购节（保留旧内容）                                                         | wiki 每个 § 标注适用公司 [🌍🚀🏛️] 和来源（🟢/🟡/🔴）                                                   |
| G4.4 | todo | 验收 + 面试闭环：验收清单全过（测试/build/lint/E2E 旅程/TS7 数字/README）；对接 08-08 补考实弹 + Day 3 话术卡 + kanban 更新                                   | 验收 5 项全 ✅；`hermes kanban --board interview-learning` 推进（Day 3 完成 / Day 2 可考试）           |
