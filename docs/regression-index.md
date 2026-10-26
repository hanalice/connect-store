# 回归索引（Regression Index）

> 用途：全项目用例的统一索引，**所有 G 任务共用**，不隶属于任何单个 G。
> QA 验收时按本表执行回归；人和 agent 都按「编号 → 层级 → 命令」一行查到底。
>
> **维护规则（强制）**：
>
> 1. 每个 G 的 QA 验收后更新本表（新用例入行、状态翻转、口径修正）；
> 2. **新用例编号必须嵌入测试标题**（如 `test('E2E-AI-05 …')`），保证 `grep` 可单条定位；
> 3. 状态口径：✅ 已实现 / 🟡 部分实现或待核实 / ⬜ 待实现（标注所属 G） / ~~删除线~~ 已撤销。

---

## 1. 快速回归命令

| 场景             | 命令                                            | 覆盖                       | 耗时量级 | 门禁                                     |
| ---------------- | ----------------------------------------------- | -------------------------- | -------- | ---------------------------------------- |
| 单测 + 集成全量  | `npm test`                                      | vitest 20 文件 / 137 用例  | ~6s      | pre-commit ✅                            |
| server 单测全量  | `cd server && npm test`                         | vitest 9 文件 / 72 用例    | ~2s      | pre-commit ✅ + CI（裁决④，G4.1 四件套） |
| E2E 全量（mock） | `npm run test:e2e`                              | E2E-AI-01~24（mock 23 条） | ~26s     | CI ✅ + 本地（裁决②④，G4.1 落地）        |
| live 冒烟        | `npm run test:e2e:live`（先 `npm run dev:bff`） | E2E-AI-09                  | ~3s      | 手动，不进 CI（G4.1 容错改造后复跑 ✅）  |
| E2E 单条定位     | `npx playwright test -g "E2E-AI-05"`            | 按编号 grep 标题           | —        | —                                        |
| vitest 单条定位  | `npx vitest run -t "INT-AI-02"`                 | 按编号 grep 标题           | —        | —                                        |

> **环境预检（G4.1 签核注记，承接 G3.2 遗留 #3）**：跑 mock E2E 前 `ss -tlnp | grep -E '8787|5173'`
> 确认 8787 未被真实 BFF / 其他进程占用（占用则 mock webServer 起不来或控制面 404）；跑 live 冒烟
> 前先杀残留 mock、跑完杀 BFF（用完杀）。CI 无此问题（干净 runner）。

## 2. 用例总索引

### 2.1 单元 / 集成（vitest，`npm test`，pre-commit 门禁）

| ID                 | 状态 | 位置与定位方式                                                                                                                                    | 备注                                                                |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| UT-01 ~ UT-23      | ✅   | `catalogSelectors.test.ts` 等；**标题未嵌编号**（存量），全量跑覆盖                                                                               | 存量 27 基线内                                                      |
| UT-STORE-01 ~ 03   | ✅   | 存量覆盖；标题未嵌编号                                                                                                                            | 存量 27 基线内                                                      |
| INT-01 ~ INT-17    | ✅   | `CatalogPage.test.tsx`；**INT-08~16 已嵌标题**可 `-t` 定位                                                                                        | 存量 27 基线内                                                      |
| INT-AI-01          | ✅   | `chatApi.test.ts`（传输层受控流）+ E2E-AI-02 浏览器侧映射                                                                                         | G1.3 / G1.4 落地                                                    |
| INT-AI-02          | ✅   | `useAssistantStore.test.ts`（标题嵌编号，G2.3 扩充工具失败分流 / aborted 恢复 / error 再发）+ E2E-AI-03 / 12 / 13 映射                            | G1.3 / G1.4 落地，G2.3 扩充                                         |
| A11Y-01 / A11Y-02  | ✅   | `CatalogPage.test.tsx` 内 `A11Y: Verify basic landmark…` 一条                                                                                     | 标题未嵌编号，grep `A11Y`                                           |
| A11Y-04            | ✅   | `StreamingText.tsx` aria-live + E2E-AI-02 断言                                                                                                    | G1.3 / G1.4 落地                                                    |
| API-01 ~ API-03    | 🟡   | 存量隐含覆盖（无独立用例文件、标题无编号），G4.1 测试矩阵收口时核实口径                                                                           | 待核实                                                              |
| A11Y-03            | 🟡   | 未明确对应用例，G4.1 核实                                                                                                                         | 待核实                                                              |
| UT-ASM-01 ~ 09     | ✅   | `assistantMachine.test.ts`（标题嵌编号，`-t` 可定位）                                                                                             | G2.2 落地，11 用例（09 编号全覆盖 + 必含项）                        |
| UT-REG-01 ~ 04     | ✅   | `uiRegistry.test.tsx`（标题嵌编号，`-t` 可定位）；报告 `docs/reports/G2.4.md` §二 #2                                                              | G2.4 落地（QA 验收 2026-10-25）                                     |
| UT-CART-01 ~ 03    | ✅   | `useCartStore.test.ts`（标题嵌编号，`-t` 可定位）+ CartDrawer/CartBadge 组件用例                                                                  | G3.1 落地（QA 验收 2026-10-25，报告 `docs/reports/G3.1.md`）        |
| INT-AI-03          | ✅   | `ToolCallPanel.test.tsx`（4 条）+ `useAssistantStore.test.ts`（单工具/多工具链，标题嵌编号）+ E2E-AI-10 映射                                      | G2.3 落地                                                           |
| INT-AI-04          | ✅   | `ChatPanel.generativeUi.test.tsx`（标题嵌编号）+ E2E-AI-14 映射；报告 `docs/reports/G2.4.md` §二 #2                                               | G2.4 落地（QA 验收 2026-10-25）                                     |
| INT-AI-05          | ✅   | `AgentStatusBadge.test.tsx`（9 态投影，标题嵌编号）+ E2E-AI-11 映射                                                                               | G2.3 落地                                                           |
| INT-HITL-01 ~ 04   | ✅   | `ApprovalCard.test.tsx`（标题嵌编号，01~04 全覆盖）+ `useAssistantStore.test.ts`（回放构造/表缺口/取消路径）；01 映射 E2E-AI-19、02 → 20、03 → 21 | G3.3 落地（QA 验收 2026-10-26，报告 `docs/reports/G3.3.md` §二 #9） |
| A11Y-05            | ✅   | `ChatPanel.recovery.test.tsx` 焦点管理用例（审批卡出现移入 / 决策后归还 composer）                                                                | G3.4 落地（G4.1 补登记）                                            |
| ~~UT-RET-01 ~ 04~~ | 撤销 | v0.4 撤销语义检索（ADR D6 作废）                                                                                                                  | 不实现                                                              |

### 2.1b server 侧单测（vitest，`cd server && npm test`，G2.1 落地；G4.1 起 pre-commit 四件套 + CI）

| ID                    | 状态 | 位置与定位方式                                                                                                               | 备注                    |
| --------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| （数据层过滤）        | ✅   | `server/data/products.test.ts`（15 条）                                                                                      | 标题未嵌编号，G4.1 统一 |
| （searchCatalog）     | ✅   | `server/tools/searchCatalog.test.ts`（6 条）                                                                                 | 标题未嵌编号，G4.1 统一 |
| （addToCart）         | ✅   | `server/tools/addToCart.test.ts`（5 条）                                                                                     | 标题未嵌编号，G4.1 统一 |
| （getProductDetails） | ✅   | `server/tools/getProductDetails.test.ts`（3 条）                                                                             | 标题未嵌编号，G4.1 统一 |
| （审批·TTL 域）       | ✅   | `approvals.test.ts`（11）+ `orders.test.ts`（12）+ `tools/placeOrder.test.ts`（9）+ `chat-approval.integration.test.ts`（4） | 标题未嵌编号，G4.1 统一 |
| （env 校验）          | ✅   | `server/env.test.ts`（7 条）                                                                                                 | G3.2 引入，G4.1 补登    |

### 2.2 E2E（Playwright，`npm run test:e2e`）

| ID             | 状态 | 位置                                                                                                     | 门禁                                                      |
| -------------- | ---- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| E2E-AI-01 ~ 08 | ✅   | `e2e/assistant.e2e.ts`（标题嵌编号，`-g` 可单条定位）                                                    | CI ✅（G4.1 落地，裁决②根因修复后）                       |
| E2E-AI-10 ~ 13 | ✅   | `e2e/assistant.e2e.ts`（G2.3 工具调用场景，命名闸门中间态断言）                                          | CI ✅（G4.1 落地）                                        |
| E2E-AI-14 ~ 15 | ✅   | `e2e/assistant.e2e.ts`（G2.4 Generative UI 场景；14 映射 INT-AI-04 / 裁决⑥，15 映射 UT-REG-02 E2E 侧）   | CI ✅（G4.1 落地）；报告 `docs/reports/G2.4.md` §二 #3    |
| E2E-AI-16 ~ 17 | ✅   | `e2e/assistant.e2e.ts`（G3.1 `__e2e_cart__` 加购/持久化场景；16 映射 UT-CART-01，17 映射 UT-CART-02/03） | CI ✅（G4.1 落地）；报告 `docs/reports/G3.1.md` §二 #3    |
| E2E-AI-18      | ✅   | `e2e/assistant.e2e.ts`（G3.1a 目录页加购入口，page.route 回放远程商品快照）                              | CI ✅（G4.1 落地）；报告 `docs/reports/G3.1a.md` §二      |
| E2E-AI-19 ~ 21 | ✅   | `e2e/assistant.e2e.ts`（G3.3 `__e2e_order__` 有状态审批场景：19 映射 INT-HITL-01 / 20 → 02 / 21 → 03）   | CI ✅（G4.1 落地）；报告 `docs/reports/G3.3.md` §二 #3~#4 |
| E2E-AI-22 ~ 24 | ✅   | `e2e/assistant.e2e.ts`（G3.4 失败恢复场景：22 重试 / 23 aborted / 24 审批中断保位）                      | CI ✅（G4.1 落地）；报告 `docs/reports/G3.4.md` §二 #6    |
| E2E-AI-09      | ✅   | `e2e/live-smoke.e2e.ts`（`@live` 标签隔离；G4.1 裁决③容错改造后带 BFF live 复跑通过 2026-10-26）         | **手动**，不进 CI                                         |

### 2.3 BFF / 安全契约（curl 验收，QA 每 G 执行）

| ID        | 状态 | 所属 G                                               | 验收方式                |
| --------- | ---- | ---------------------------------------------------- | ----------------------- |
| API-AI-01 | ✅   | G3.2 已落地（报告 `docs/reports/G3.2.md` §二 #5）    | curl（未审批拦截）      |
| API-AI-02 | ✅   | G2.1 已落地（报告 `docs/reports/G2.1.md` §二 #1–#9） | curl（单通道+价格区间） |
| API-AI-03 | ⬜   | G1.4 已部分覆盖（error chunk / 502）                 | curl + E2E              |
| API-AI-04 | ✅   | G3.2 已落地（报告 `docs/reports/G3.2.md` §二 #6）    | curl（按 orderId 查询） |
| API-AI-05 | ✅   | G3.2 已落地（报告 `docs/reports/G3.2.md` §二 #7）    | curl（TTL 过期）        |
| API-AI-06 | ✅   | G3.2 已落地（报告 `docs/reports/G3.2.md` §二 #3）    | curl（伪造审批拦截）    |

## 3. 使用约定

- **QA 验收工单**的回归部分引用本表 §1 三条门禁命令，逐 G 全量跑（已制度化）；
- 修改某模块后做**局部回归**：按本表找该模块相关编号，用 `-g` / `-t` 单条或成组跑；
- **新增用例时**：先在本表登记编号与归属 G，再实现；编号入测试标题；
- 本表与 `docs/test_cases.md` 的关系：test_cases.md 是**用例设计**（步骤/预期），
  本表是**执行索引**（状态/位置/命令）；两者编号一致，互相引用。

## 4. 已知约束

- **server 侧状态为单会话内存单例**（裁决⑥，PM 接受口径；挂账出处：G3.2 报告
  §六签核遗留表 #2「edit 全量 reject 多会话干扰」）：订单表 / 签发时刻表 / 审批状态
  均存活于单个 BFF 进程内存，无 cart/会话维度的隔离键。
- **edit「新单全量取代旧 pending」**：在单用户 Showcase 前提下，同时刻至多一张
  pending，语义等价、行为正确；多会话共用内存单例时，A 用户新单会拒掉 B 用户
  pending 单——属跨会话干扰隐患，当前部署形态不触发。
- **多会话化前置项**（未来）：订单表 / 签发时刻表 / 审批状态须按 cart/会话键收敛，
  为第一前置项；收敛前任何「多用户并发审批」场景不在本仓库测试承诺范围内。
