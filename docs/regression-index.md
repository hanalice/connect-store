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

| 场景             | 命令                                            | 覆盖                    | 耗时量级 | 门禁                                   |
| ---------------- | ----------------------------------------------- | ----------------------- | -------- | -------------------------------------- |
| 单测 + 集成全量  | `npm test`                                      | vitest 6 文件 / 38 用例 | ~3s      | pre-commit ✅                          |
| server 单测全量  | `cd server && npm test`                         | vitest 4 文件 / 29 用例 | ~1s      | 手动（是否入 pre-commit 由 G4.1 决策） |
| E2E 全量（mock） | `npm run test:e2e`                              | E2E-AI-01~08            | ~7s      | 本地门禁（G4.1 入 CI）                 |
| live 冒烟        | `npm run test:e2e:live`（先 `npm run dev:bff`） | E2E-AI-09               | ~6s      | 手动，不进 CI                          |
| E2E 单条定位     | `npx playwright test -g "E2E-AI-05"`            | 按编号 grep 标题        | —        | —                                      |
| vitest 单条定位  | `npx vitest run -t "INT-AI-02"`                 | 按编号 grep 标题        | —        | —                                      |

## 2. 用例总索引

### 2.1 单元 / 集成（vitest，`npm test`，pre-commit 门禁）

| ID                 | 状态 | 位置与定位方式                                                          | 备注                      |
| ------------------ | ---- | ----------------------------------------------------------------------- | ------------------------- |
| UT-01 ~ UT-23      | ✅   | `catalogSelectors.test.ts` 等；**标题未嵌编号**（存量），全量跑覆盖     | 存量 27 基线内            |
| UT-STORE-01 ~ 03   | ✅   | 存量覆盖；标题未嵌编号                                                  | 存量 27 基线内            |
| INT-01 ~ INT-17    | ✅   | `CatalogPage.test.tsx`；**INT-08~16 已嵌标题**可 `-t` 定位              | 存量 27 基线内            |
| INT-AI-01          | ✅   | `chatApi.test.ts`（传输层受控流）+ E2E-AI-02 浏览器侧映射               | G1.3 / G1.4 落地          |
| INT-AI-02          | ✅   | `useAssistantStore.test.ts`（标题嵌编号）+ E2E-AI-03 映射               | G1.3 / G1.4 落地          |
| A11Y-01 / A11Y-02  | ✅   | `CatalogPage.test.tsx` 内 `A11Y: Verify basic landmark…` 一条           | 标题未嵌编号，grep `A11Y` |
| A11Y-04            | ✅   | `StreamingText.tsx` aria-live + E2E-AI-02 断言                          | G1.3 / G1.4 落地          |
| API-01 ~ API-03    | 🟡   | 存量隐含覆盖（无独立用例文件、标题无编号），G4.1 测试矩阵收口时核实口径 | 待核实                    |
| A11Y-03            | 🟡   | 未明确对应用例，G4.1 核实                                               | 待核实                    |
| UT-ASM-01 ~ 09     | ⬜   | G2.2（状态机转换表）                                                    | 待实现                    |
| UT-REG-01 ~ 04     | ⬜   | G2.4（Generative UI registry 白名单）                                   | 待实现                    |
| UT-CART-01 ~ 03    | ⬜   | G3.1（购物车 store）                                                    | 待实现                    |
| INT-AI-03          | ⬜   | G2.3（ToolCallPanel）                                                   | 待实现                    |
| INT-AI-04          | ⬜   | G2.4（registry 动态卡片）                                               | 待实现                    |
| INT-AI-05          | ⬜   | G2.3（AgentStatusBadge 投影）                                           | 待实现                    |
| INT-HITL-01 ~ 04   | ⬜   | G3.3（审批卡）                                                          | 待实现                    |
| A11Y-05            | ⬜   | G3.3（审批弹窗焦点）                                                    | 待实现                    |
| ~~UT-RET-01 ~ 04~~ | 撤销 | v0.4 撤销语义检索（ADR D6 作废）                                        | 不实现                    |

### 2.1b server 侧单测（vitest，`cd server && npm test`，G2.1 落地）

| ID                    | 状态 | 位置与定位方式                                   | 备注                    |
| --------------------- | ---- | ------------------------------------------------ | ----------------------- |
| （数据层过滤）        | ✅   | `server/data/products.test.ts`（15 条）          | 标题未嵌编号，G4.1 统一 |
| （searchCatalog）     | ✅   | `server/tools/searchCatalog.test.ts`（6 条）     | 标题未嵌编号，G4.1 统一 |
| （addToCart）         | ✅   | `server/tools/addToCart.test.ts`（5 条）         | 标题未嵌编号，G4.1 统一 |
| （getProductDetails） | ✅   | `server/tools/getProductDetails.test.ts`（3 条） | 标题未嵌编号，G4.1 统一 |

### 2.2 E2E（Playwright，`npm run test:e2e`）

| ID             | 状态 | 位置                                                  | 门禁                   |
| -------------- | ---- | ----------------------------------------------------- | ---------------------- |
| E2E-AI-01 ~ 08 | ✅   | `e2e/assistant.e2e.ts`（标题嵌编号，`-g` 可单条定位） | 本地门禁（G4.1 入 CI） |
| E2E-AI-09      | ✅   | `e2e/live-smoke.e2e.ts`（`@live` 标签隔离）           | **手动**，不进 CI      |

### 2.3 BFF / 安全契约（curl 验收，QA 每 G 执行）

| ID        | 状态 | 所属 G                                               | 验收方式                |
| --------- | ---- | ---------------------------------------------------- | ----------------------- |
| API-AI-01 | ⬜   | G3.2                                                 | curl（未审批拦截）      |
| API-AI-02 | ✅   | G2.1 已落地（报告 `docs/reports/G2.1.md` §二 #1–#9） | curl（单通道+价格区间） |
| API-AI-03 | ⬜   | G1.4 已部分覆盖（error chunk / 502）                 | curl + E2E              |
| API-AI-04 | ⬜   | G3.2                                                 | curl（按 orderId 查询） |
| API-AI-05 | ⬜   | G3.2                                                 | curl（TTL 过期）        |
| API-AI-06 | ⬜   | G3.2                                                 | curl（伪造审批拦截）    |

## 3. 使用约定

- **QA 验收工单**的回归部分引用本表 §1 三条门禁命令，逐 G 全量跑（已制度化）；
- 修改某模块后做**局部回归**：按本表找该模块相关编号，用 `-g` / `-t` 单条或成组跑；
- **新增用例时**：先在本表登记编号与归属 G，再实现；编号入测试标题；
- 本表与 `docs/test_cases.md` 的关系：test_cases.md 是**用例设计**（步骤/预期），
  本表是**执行索引**（状态/位置/命令）；两者编号一致，互相引用。
