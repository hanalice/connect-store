## AI Assistant TODO List

> 本清单是 `docs/ai-assistant-design.md` §10 的**细化执行版**，是 IDE 施工的唯一任务依据（`docs/ai-assistant-design.md` 整体为唯一施工文档）。
> **拆分原则**：每个任务都是「前后端一起」的端到端最小交付（如 G1 流式对话 = BFF 端点 + 前端面板一起验收），不做「先做完全部后端再做前端」的整层交付。
> **任务粒度**：0.5~2 天一个，完成即可独立验证。
> **任务状态**：`todo`（未做）/ `done`（完成）；完成后勾选并 git 提交。
> **编号体系**：`G<Phase>.<序号>`；每个目标（G0-G4）指向其解决的面试问题与市场依据。

### 目标总览（编号 + 指向）

| 目标 | 一句话目标                                   | 指向（面试问题 / 市场依据）                                              | 补充信息 |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| G0   | TS 7.0 升级 + 迁移实测                       | Day 3 TS7 话术卡（真实项目迁移数字）                                     | 约 1 天  |
| G1   | 流式对话骨架（端到端切片）                   | 08-08 补考「Streaming UI」子问题；8/31 发现③ AI SDK 2,356 万/周          | 约 2 天  |
| G2   | 工具调用 + 状态机 + Generative UI + 语义检索 | 08-08 补考「工具回路 / 状态机投影 / Generative UI 安全」子问题；阿里 #40 | 约 4 天  |
| G3   | HITL 下单审批（Showcase 核心）               | 08-08 补考「HITL 三条出边」核心子问题                                    | 约 3 天  |
| G4   | 收尾：测试 / 文档 / story                    | 08-20 Vitest 材料；README 5 分钟面试演练                                 | 约 2 天  |

### 任务详情

| 任务 | 状态 | 任务描述                                                                                                                                                      | 完成标准                                                                                               |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| G0.1 | todo | 建 `feat/ai-assistant` 分支                                                                                                                                   | `git branch` 显示在 feat/ai-assistant；工作区干净                                                      |
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
