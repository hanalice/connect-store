## AI Assistant TODO List

> 本清单是 `docs/ai-assistant-design.md` §10 的**细化执行版**，是 IDE 施工的唯一任务依据（`docs/ai-assistant-design.md` 整体为唯一施工文档）。
> **v0.4 口径变更（2026-10-16）**：① 前后端消息协议走**官方 UI 消息流**（前端自研传输层消费，**不自定义协议**）；② **不做语义检索**（G2.5 已删除，embedding / retrieval / descriptions 全部移除）；③ HITL = **SDK 原生 `toolApproval` + 签名 + 自建 BFF 订单表**分层；④ 状态机新增 `aborted`（`await_human → aborted` 统一）；⑤ `searchCatalog` 增 `maxPrice` / `minPrice`；⑥ 数据源 = BFF 冻结快照 + dev 同源代理。
> **拆分原则**：每个任务都是「前后端一起」的端到端最小交付（如 G1 流式对话 = BFF 端点 + 前端面板一起验收），不做「先做完全部后端再做前端」的整层交付。
> **任务粒度**：0.5~2 天一个，完成即可独立验证。
> **任务状态**：`todo`（未做）/ `done`（完成）；完成后勾选并 git 提交。
> **提交纪律（本仓库实测）**：pre-commit hook = `npm run lint` + `npm run format:check` + `npm test`。**未格式化的文件会卡住任何提交（含 docs 改动）** → 提交前先 `npx prettier --write <改动的文件>`；三件套全绿才 `git commit`，不要用 `--no-verify` 绕过。
> **编号体系**：`G<Phase>.<序号>`；每个目标（G0-G4）指向其解决的面试问题与市场依据。
> **排期**：见「施工顺序与排期（2026-10-13 定）」——**硬约束 = 不占用求职 P0 时段**（P0 未收口则顺延）。

### 目标总览（编号 + 指向）

| 目标 | 一句话目标                        | 指向（面试问题 / 市场依据）                                              | 补充信息                            | 排期                               |
| ---- | --------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------- |
| G0   | TS 7.0 升级 + 迁移实测            | Day 3 TS7 话术卡（真实项目迁移数字）                                     | 约 1 天                             | **W10-12**（10-15，与 Day 4 合并） |
| G1   | 流式对话骨架（端到端切片）        | 08-08 补考「Streaming UI」子问题；8/31 发现③ AI SDK 2,356 万/周          | 约 2 天                             | **W10-19**（10-19 ~ 10-23）        |
| G2   | 工具调用 + 状态机 + Generative UI | 08-08 补考「工具回路 / 状态机投影 / Generative UI 安全」子问题；阿里 #40 | 约 3 天（v0.4 去语义检索，原 4 天） | **W10-19 ~ W10-26**（G2.2 可提前） |
| G3   | HITL 下单审批（Showcase 核心）    | 08-08 补考「HITL 三条出边」核心子问题                                    | 约 3 天                             | **W10-26 ~ W11-02**                |
| G4   | 收尾：测试 / 文档 / story         | 08-20 Vitest 材料；README 5 分钟面试演练                                 | 约 2 天                             | **W11-02**（11-05 ~ 11-06）        |

---

## 施工顺序与排期（2026-10-13 定）

> **决策依据**：用户确认「React 深度 + AI 能力两者都要」，G0–G4 全量做。本项目职责 = **React 底层深度 + AI 交互层证据**（Generative UI / 状态机投影 / HITL）；**不**承担检索 / 编排层证据（RAG、混合检索、多 Agent 编排由 newtalk 承担，避免重复叙事）。见 `~/hermes-agent/career-path/strategy-note.md` §3 / §4②。
>
> **硬约束（优先级高于本表）**：求职 **P0 = 三项目答辩深度提炼 + 追问预案**，直接决定面试通过率。**P0 未收口则 G1 顺延**，不允许用本项目的工程时间置换 P0 时段。

### 依赖顺序（不跳步）

```
G0（TS7 迁移 + 开工前实测）──► G1（BFF 骨架 + 流式）──► G2（工具 / 状态机 / Generative UI）──► G3（HITL 审批）──► G4（测试 / 文档 / README）
                      ▲
                      └── G2.2 状态机是「前端纯函数、零依赖」→ 可提前到任何空档，立刻产出单测 + React 深度素材
```

- **G1 是 G2 / G3 的前置**：没有 BFF 骨架与流式通道，工具调用与审批没有落点。
- **G0.4 是 G3 的前置实测**：`toolApproval` 的 TTL 扩展可行性须在 G0 阶段用 30 分钟最小实验确认（决定 G3 走 SDK 原生还是纯自研，见 design §6.2）。
- **G3 依赖 G2 的工具契约**：`placeOrder` 必须挂在工具回路与状态机上，否则三出边无处触发。
- **G4 依赖 G1–G3 全部完成**：测试矩阵与 README story 要引用真实实现，不能先写。
- **唯一可提前项 = G2.2**（纯函数状态机 + 转换表）：不依赖 BFF，可与 G0/G1 并行。

### 周排期

| 周次               | 日期                  | 任务                                                                     | 交付物 / 验收                                                                                                                                             |
| :----------------- | :-------------------- | :----------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W10-12**（本周） | **10-15（Day 4）**    | **G0.2 + G0.3** —— 与周计划 Day 4 的 `tsc --noEmit` 7.x 实测**合并交付** | `docs/ts7-migration.md`：含仓库 LOC / 机器 / 冷热缓存 / `--incremental` / 单线程开关**口径声明** + 报错分类；同时作为 Day 4 交付物                        |
|                    | 10-16 ~ 10-18（空档） | **G2.2**（可提前项）—— 纯函数状态机 + 转换表驱动单测                     | `assistantMachine.ts` + ≥6 条路径全绿，测试 27 → ≥33                                                                                                      |
| **W10-19**         | 10-19 ~ 10-20         | G0.4 / G1.1 / G1.2（TTL 实测 + BFF 初始化 + 流式端点）                   | 30 分钟最小实验确认 `toolApproval` 内 TTL 判定可行（不可行 → 记明证据并转纯自研）；`npm run dev` 起服务；`curl /health` 200；`curl -N /api/chat` 流式完整 |
|                    | 10-21 ~ 10-23         | G1.3 / G1.4 + G2.1（前端对话切片 + 错误处理 + 工具定义）                 | 浏览器流式打字机渲染；断网 / 停 BFF 不白屏；curl 逐工具验证（非法输入 → Zod 报错）                                                                        |
| **W10-26**         | 10-26 ~ 10-27         | G2.3 / G2.4（工具端到端 + Generative UI registry）                       | 对话触发 `searchCatalog` → 工具卡实时显示；未注册 toolName → fallback 文本单测过                                                                          |
|                    | 10-28 ~ 10-30         | G3.1（购物车切片）                                                       | 加购 / 删改 / 合计正确（单测 CRUD + persist 恢复）                                                                                                        |
| **W11-02**         | 11-02 ~ 11-04         | G3.2 / G3.3 / G3.4（审批后端 + 前端 + 失败恢复）                         | 端到端闭环：对话 → 推荐 → 加购 → 下单 → 审批 → 订单号；reject 后 AI 修正链路跑通；edit 走「带修改重新发起」；超时 → expired；伪造审批被拦截               |
|                    | 11-05 ~ 11-06         | G4.1 ~ G4.4（测试矩阵 / README story / 文档 / 验收）                     | 总测试 **≥45 全绿**（推导见 G4.1）+ CI 通过；README 5 分钟可讲完；wiki 增补 AI 导购节                                                                     |

**总计约 10 个工作日 + 缓冲**（v0.4 相对 v0.3：删去 G2.5 语义检索约 0.5~1 天，11 → 10 个工作日；G0 增加 30 分钟 TTL 实测）：10-15 零散启动（G0 + G2.2），10-19 起因 P0 收口转入连续施工，预计 **11-06 前**完成 G0–G4。

### 排期的滑动规则

- 本表**只在「不影响 P0」的前提下滑动**；每周一由 `interview-plan.md` 复排时同步校准。
- 每完成一个 G：勾选本文件任务状态 + `git commit`（commit message 记口径与数字来源）。
- 全部收口后回写两处：`~/hermes-agent/career-path/strategy-note.md` §4②（排期状态）+ wiki `connect-store-architecture.md`（追加 AI 导购节，保留旧内容）。

---

### 任务详情

| 任务 | 状态 | Prompt                       | 任务描述                                                                                                                                                                                                                                                                     | 完成标准                                                                                                                                               |
| ---- | ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G0.1 | done | —                            | 建 `feat/ai-assistant` 分支（✅ 2026-09-01 已建，为当前分支）                                                                                                                                                                                                                | `git branch` 显示在 feat/ai-assistant；工作区干净                                                                                                      |
| G0.2 | done | —                            | `npm i -D typescript@^7`，适配 tsconfig/eslint(typescript-eslint)/vitest/@types/node                                                                                                                                                                                         | `tsc -b` 全绿；`npm run build` 通过；`npm test` **27 通过不回归**                                                                                      |
| G0.3 | todo | —                            | 记录 TS7 迁移实测（安装/构建/类型检查耗时前后对比 + 报错分类），落盘 `docs/ts7-migration.md`                                                                                                                                                                                 | 文档含可引用数字（带单位和推导链，不编造）；测试仍 27 绿                                                                                               |
| G0.4 | done | —                            | **开工前最小实测（30 分钟）**：`toolApproval` 回调内的 TTL 判定在审批复放时是否稳定生效（过期 → `{type:'denied', reason:'approval expired'}`）                                                                                                                               | 实测结论落盘并有证据（成功 → G3 走 SDK 原生；失败 → 记录证据、转纯自研 pending 队列并告知用户）                                                        |
| G1.1 | todo | [G1.1](kimi-prompts/G1.1.md) | BFF 工程初始化：`server/` 目录（hono + ai + zod + dotenv + env.ts 用 LLM\_\* 变量）+ `GET /health` + 前端 Vite proxy `/api` → BFF                                                                                                                                            | `npm run dev` 起服务；`curl /health` 200；前端 dev 环境 `/api` 可达 BFF                                                                                |
| G1.2 | todo | —                            | 后端流式端点：`POST /api/chat` → `ai.streamText`（无工具），输出**官方 UI 消息流**                                                                                                                                                                                           | `curl -N` 流式输出完整（含 finish 事件）                                                                                                               |
| G1.3 | todo | —                            | 前端对话切片：`/assistant` 路由 + `ChatPanel` + `StreamingText`（打字机）+ `chatApi`（**自研传输层，消费官方 UI 消息流 `UIMessageChunk`**）                                                                                                                                  | 浏览器问「推荐免费的素材」→ 流式回复完整渲染                                                                                                           |
| G1.4 | todo | —                            | 切片验收：错误处理（网络断 / 500）+ 手动走查                                                                                                                                                                                                                                 | 断网/停 BFF 不白屏、提示明确；`npm test` 仍 27 绿                                                                                                      |
| G2.1 | todo | —                            | 工具定义（BFF）：`searchCatalog`（**含 `maxPrice` / `minPrice` 价格区间**）/ `getProductDetails` / `addToCart`（Zod schema 校验输出；数据源 = BFF 冻结快照，真实执行筛选 / 排序 / 区间过滤）                                                                                 | curl 逐工具验证（含非法输入 → Zod 明确报错）；「20 刀以内」过滤结果正确                                                                                |
| G2.2 | todo | —                            | 状态机（前端纯函数）：`assistantMachine` — 7 主体状态（idle/thinking/tool_calling/tool_result/streaming/await_human/done）+ 2 附加态（error/**aborted**）+ 事件枚举 + 事件日志（环形缓冲 200 条）                                                                            | 转换表单测 **≥7 条路径**全绿（含 `aborted` 与 `await_human → aborted`）+ 非法转换拒绝；测试 27 → ≥34                                                   |
| G2.3 | todo | —                            | 工具调用端到端切片：`/api/chat` 接入 tools + `useAssistantStore` + `ToolCallPanel`（工具名/参数/状态/耗时）                                                                                                                                                                  | 对话触发 `searchCatalog` → 面板实时显示工具卡；状态投影正确                                                                                            |
| G2.4 | todo | —                            | Generative UI 切片：`uiRegistry` 按官方 `tool-${toolName}` 分发（`tool-searchCatalog` → ProductGrid+ProductCard / EmptyState / ToolError；`tool-getProductDetails` → PriceBreakdown；`tool-placeOrder` → ApprovalCard），**复用存量 ProductGrid / ProductCard / EmptyState** | 推荐商品渲染真实 ProductCard（非纯文本，视觉与目录页同源）；「未注册 toolName（含 dynamic tool call）→ fallback 文本」单测通过；气泡内窄宽度列数已确认 |
| G3.1 | todo | —                            | 购物车切片：`useCartStore`（Zustand + persist）+ `CartDrawer` + `addToCart` 工具前端接线                                                                                                                                                                                     | 浏览器加购/删改/合计正确；单测 CRUD + persist 恢复                                                                                                     |
| G3.2 | todo | —                            | 审批后端切片：`toolApproval`（`placeOrder: 'user-approval'` + 金额阈值分级）+ `experimental_toolApprovalSecret` 签名 + `approvals.ts`（TTL 校验 + 签发时刻表）+ `orders.ts` 订单表（pending/approved/rejected/expired，按 orderId 查询）                                     | curl 走通 pending → approve / reject / edit；超时 → expired；**未审批直接下单被拦截（`API-AI-01`）**                                                   |
| G3.3 | todo | —                            | 审批前端切片：`ApprovalCard`（订单摘要 + 三按钮）+ `addToolApprovalResponse` + `await_human` 状态投影 + 端到端闭环                                                                                                                                                           | 浏览器完整闭环：对话→推荐→加购→下单→审批→订单号；reject 后 AI 修正链路跑通；edit 走「不发审批、带修改重新发起」                                        |
| G3.4 | todo | —                            | 失败恢复切片：error / **aborted** 态 + 重试按钮（**仅 error 显示**）+ 降级提示（「可回目录手动选购」）                                                                                                                                                                       | 断网/停 BFF 不白屏、可恢复；单测覆盖 error→idle 与 aborted→thinking；aborted 下无重试按钮                                                              |
| G4.1 | todo | —                            | 测试矩阵补全：registry 4 类用例 + 状态转换表（含 aborted）+ 传输层受控流测试 + 审批 / TTL 用例 + ChatPanel 集成测试                                                                                                                                                          | **总测试 ≥45 全绿**（推导：27 基线 + 状态机 7 + registry 4 + 传输层 2 + 审批/TTL 5；**目标值，G4 实测后回填确切数**）；CI（GitHub Actions）通过        |
| G4.2 | todo | —                            | README 升级为 5 分钟 story（对齐 vercel/ai-chatbot：特性/架构图/技术栈/HITL 流程/测试/部署）                                                                                                                                                                                 | README 可在 5 分钟内讲完（面试演练）                                                                                                                   |
| G4.3 | todo | —                            | 设计文档最终版（含 mermaid 架构图）+ wiki `connect-store-architecture.md` 追加 AI 导购节（保留旧内容）——**跨仓库部分（`~/wiki`、`~/hermes-agent`）属事实源，须经用户逐次明确授权才可动；未获授权时由用户本人收口，IDE Agent 只改本仓库**                                     | wiki 每个 § 标注适用公司 [🌍🚀🏛️] 和来源（🟢/🟡/🔴）                                                                                                   |
| G4.4 | todo | —                            | 验收 + 面试闭环：验收清单全过（测试/build/lint/E2E 旅程/TS7 数字/README）；对接 08-08 补考实弹 + Day 3 话术卡 + kanban 更新                                                                                                                                                  | 验收 5 项全 ✅；`hermes kanban --board interview-learning` 推进（Day 3 完成 / Day 2 可考试）                                                           |
