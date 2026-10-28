# Test Case Design: Connect Store Project

## 1. Testing Strategy

- **Unit Testing (UT)**: Focus on core logic (selectors, store, API helpers, pure-function state machine transitions, registry schemas, and vector cosine similarity) using Vitest.
- **Integration Testing**: Focus on component interaction, UX flows, typewriter streaming rendering, and HITL approval dialogs using React Testing Library.
- **Deterministic AI Mocking**: Treat LLM as an unpredictable dependency; enforce deterministic testing via controlled stream mocks (`vi.mock('ai')`) and fake timers.
- **Security & Contract Enforcement**: Verify Generative UI whitelist boundaries, JSON schema validation, and BFF unapproved order interception.

---

## 2. Unit Test Cases (UT)

### 2.1 Catalog Selectors (`catalogSelectors.ts`)

| ID    | Title                    | Description                                            | Expected Result                             |
| ----- | ------------------------ | ------------------------------------------------------ | ------------------------------------------- |
| UT-01 | Keyword Search (Creator) | Search for an existing creator name.                   | Returns matched items only.                 |
| UT-02 | Keyword Search (Title)   | Search for an existing title substring.                | Returns matched items only.                 |
| UT-11 | Multiple Pricing Options | Select "Paid" and "Free".                              | Returns items matching either.              |
| UT-20 | Sort: Default            | Sort by title A-Z.                                     | Sorted alphabetically.                      |
| UT-21 | Sort: Higher Price       | Paid items first (desc by price), then Free/View Only. | Paid desc by price, followed by categories. |
| UT-22 | Sort: Lower Price        | View Only/Free first, then Paid (asc by price).        | Paid asc by price, following others.        |
| UT-23 | Sort Fallback            | Same category/price items.                             | Sorted by title A-Z.                        |

### 2.2 Catalog Store (`useCatalogStore.ts`)

| ID          | Title           | Description                        | Expected Result                          |
| ----------- | --------------- | ---------------------------------- | ---------------------------------------- |
| UT-STORE-01 | Fetch Success   | Call `fetchProducts` successfully. | `products` populated, `loading` false.   |
| UT-STORE-02 | Fetch Failure   | Mock rejection of `getProducts`.   | `error` populated with message.          |
| UT-STORE-03 | Scroll Chunking | Trigger `increaseVisibleCount`.    | `visibleCount` increases by `chunkSize`. |

### 2.3 Assistant State Machine (`assistantMachine.ts`) - Pure Function Transition Matrix

| ID        | Title                                 | Description                                                                                       | Expected Result                                                                                |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| UT-ASM-01 | Direct Response Flow (P1)             | Transition `idle` → `thinking` on `USER_SEND`, then `thinking` → `streaming` → `done`.            | State updates sequentially to `done`; event log tracks all transitions.                        |
| UT-ASM-02 | Single Tool Execution Flow (P2)       | Transition `thinking` → `tool_calling` on `CALL_TOOL`, then `tool_result` → `streaming` → `done`. | State correctly reflects active tool call and returns to streaming upon result.                |
| UT-ASM-03 | Multi-Tool Calling Loop (P3)          | Transition `tool_result` → `tool_calling` when LLM requests secondary tool before response.       | Handles chained tool executions without dropping context; log records each tool execution.     |
| UT-ASM-04 | HITL Approval Flow (P4)               | Transition `streaming` → `await_human` on `placeOrder` proposal; approve to execute order.        | Transitions to `await_human`; on `APPROVE` moves to `tool_calling` → `tool_result` → `done`.   |
| UT-ASM-05 | HITL Rejection & Plan Amendment (P5)  | Reject proposal while in `await_human` state with user feedback reason.                           | Transitions from `await_human` back to `thinking` with feedback context passed to model.       |
| UT-ASM-06 | HITL Edit Flow (P6)                   | Trigger `EDIT` action with modified cart items in `await_human` state.                            | Transitions to `tool_calling` with updated payload, then recalculates summary.                 |
| UT-ASM-07 | Illegal State Transition Rejection    | Dispatch invalid action (e.g. `TOOL_RESULT` while in `idle` or `done`).                           | Transition is safely rejected; current state remains unchanged; warning logged.                |
| UT-ASM-08 | Ring Buffer Event History & Retention | Trigger >200 state transitions in sequence.                                                       | Ring buffer caps at exactly 200 entries, evicts oldest records in FIFO order, logs timestamps. |
| UT-ASM-09 | Stream Failure & Error Recovery       | Trigger `STREAM_ERROR` or timeout during `streaming` or `tool_calling`.                           | State transitions to `error`; supports returning to `idle` upon `RETRY` action.                |

### 2.4 Generative UI Registry & Security Boundary (`uiRegistry.tsx`)

| ID        | Title                          | Description                                                                                      | Expected Result                                                                               |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| UT-REG-01 | Whitelist Component Dispatch   | Pass valid registered payload for `productGrid` or `priceSummary`.                               | Component resolves and renders with validated props passing zod runtime validation.           |
| UT-REG-02 | Unknown Component Block        | AI emits payload requesting an unregistered component (e.g. `ArbitraryRawHTML` or `AdminPanel`). | Dispatcher strictly rejects unregistered key; renders safe fallback badge without crashing.   |
| UT-REG-03 | Schema Validation Failure      | Registered component payload has malformed or missing fields (e.g. invalid price/id type).       | Schema validator rejects payload; logs validation error; displays inline error indicator.     |
| UT-REG-04 | Component Error Boundary Guard | Registered component throws unhandled runtime error during rendering.                            | Caught by component-level Error Boundary; displays localized fallback; chat stream continues. |

### 2.5 Semantic Retrieval & In-Memory Index (`server/retrieval/`)

| ID        | Title                               | Description                                                                    | Expected Result                                                                               |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| UT-RET-01 | Cosine Similarity Calculation       | Compute cosine similarity between orthogonal, identical, and opposite vectors. | Identical vectors return 1.0, orthogonal return 0.0, opposite return -1.0; handles zero norm. |
| UT-RET-02 | Top-K Semantic Search               | Query index containing N mocked product embeddings with target vector.         | Returns Top-K items sorted strictly by cosine similarity in descending order.                 |
| UT-RET-03 | Embedding Cache Hit                 | Request embedding for previously calculated query string.                      | Returns cached vector immediately without invoking remote embedding API.                      |
| UT-RET-04 | BM25 / Lexical Fallback on API Drop | Simulate remote embedding API failure or missing API key.                      | Gracefully falls back to lexical/BM25 search; marks response metadata with fallback flag.     |

### 2.6 Cart Store (`useCartStore.ts`)

| ID         | Title                      | Description                                                                    | Expected Result                                                                             |
| ---------- | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| UT-CART-01 | Add & Quantity Merge       | Add existing product multiple times via `addToCart`.                           | Cart merges quantities of duplicate product ID; updates item count correctly.               |
| UT-CART-02 | Clear Cart (G5.1 只读收口) | Clear entire cart via the `clearCart` receipt wiring (single-writer: AI-only). | Cart emptied; total price recalculated to 0.（单行删除 / 数量步进入口随 drawer 只读化移除） |
| UT-CART-03 | Total & Price Summary      | Calculate totals with mixed items (free, paid, view-only).                     | Accurately computes subtotal and formatted display prices.                                  |

---

## 3. Integration Test Cases

### 3.1 Catalog UX Flows (`CatalogPage.test.tsx`)

| ID     | Title                                      | Description                                                 | Expected Result                                                                                                        |
| ------ | ------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| INT-01 | Initial Load                               | Mount page and fetch data.                                  | Skeleton shown then Grid rendered.                                                                                     |
| INT-02 | Combined Flow                              | Search keyword, select pricing, and change Sort option.     | Grid and URL updated with intersection + sort order.                                                                   |
| INT-03 | URL Sync                                   | Change filter and check URL.                                | URL query params match state.                                                                                          |
| INT-04 | State Restoration                          | Load page with existing query params.                       | UI initialized with correct filters.                                                                                   |
| INT-05 | Reset Action                               | Click the "Reset" button.                                   | Filters cleared in UI and URL; Search and Sort remain unchanged.                                                       |
| INT-06 | Infinite Scroll                            | Scroll to bottom sentinel.                                  | Next set of products appended.                                                                                         |
| INT-07 | Responsive Grid                            | Resize window across 480, 768, 1200px.                      | Columns change to 1, 2, 3, 4 accordingly.                                                                              |
| INT-08 | Empty State                                | Search for a non-existent keyword.                          | "No contents matched..." / EmptyState component is displayed.                                                          |
| INT-09 | Loading State                              | Trigger initial fetch or scroll.                            | Skeleton cards are visible before products render.                                                                     |
| INT-10 | Theme Switching                            | Change theme from Dark to Light via UI.                     | `data-theme` attribute on root/body updates correctly.                                                                 |
| INT-11 | Skeleton Visual Alignment (CLS Prevention) | Compare `ProductSkeletonCard` and `ProductCard` DOM/Styles. | Pixel-perfect alignment between skeleton and actual card; no layout shift when data loads.                             |
| INT-12 | Theme Persistence                          | Toggle theme and refresh the page.                          | Selected theme is saved in `localStorage` and restored on page load.                                                   |
| INT-13 | Theme-aware Skeletons                      | Switch theme and check skeleton colors.                     | Skeleton shimmer colors update immediately to match the current theme (e.g., light gray in light mode).                |
| INT-14 | Scroll-Search Concurrency                  | Change search keyword while a "Load More" chunk is pending. | Pending load is cleanly canceled/reset; new search results render without stuck skeletons.                             |
| INT-15 | Contextual Skeleton Count                  | Trigger loading for a small remaining set of items.         | Number of skeleton cards shown does not exceed the remaining item count (or at least reflects the actual data volume). |
| INT-16 | Infinite Scroll Continuation               | Verify scroll works consistently for 3+ chunks.             | No logic deadlocks occur; scroll triggers correctly until `hasMore` is false.                                          |
| INT-17 | Image Load Error Fallback                  | Manually trigger `onError` on a ProductCard image.          | Image element is replaced by a placeholder with "Image not available" text.                                            |

### 3.2 AI Assistant Streaming UI & Interaction (`ChatPanel.test.tsx`, `chatApi.ts`)

| ID        | Title                             | Description                                                                                   | Expected Result                                                                                                                                          |
| --------- | --------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INT-AI-01 | SSE Token Streaming & Typewriter  | Stream simulated SSE chunks using Vitest fake timers and mock stream.                         | Text renders incrementally with typewriter effect; autoscrolls to bottom.                                                                                |
| INT-AI-02 | Network Disconnect & AbortSignal  | User clicks "Stop" or closes drawer while the stream is active.                               | `AbortController.abort()` is triggered; stream cancels immediately; state returns to `aborted` (not `idle`), no retry button shown.                      |
| INT-AI-03 | Tool Call Visualization Rendering | UI message stream delivers `tool-${toolName}` parts (`input-available` → `output-available`). | `ToolCallPanel` renders active tool name, parsed parameters, loading spinner, and duration.                                                              |
| INT-AI-04 | Generative UI Dynamic Card Render | `tool-searchCatalog` part reaches `output-available` with items.                              | Registry dispatches to `ProductGrid` + `ProductCard` inline in the message bubble; empty result → `EmptyState`; unregistered `toolName` → text fallback. |
| INT-AI-05 | Assistant State Badge Projection  | State machine shifts between `thinking`, `tool_calling`, `await_human`.                       | `AgentStatusBadge` displays matching visual indicators, labels, and accessible ARIA attributes.                                                          |

### 3.3 HITL Order Approval Workflow (`ApprovalCard.test.tsx`)

| ID          | Title                              | Description                                                                   | Expected Result                                                                                |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| INT-HITL-01 | Approve Action Execution           | Click "Approve Order" button on `ApprovalCard`.                               | Fires `POST /api/orders` with draft ID; on success displays order confirmation & order number. |
| INT-HITL-02 | Reject Action with Feedback Reason | Click "Reject", select/enter rejection reason (e.g. "Too expensive").         | Submits rejection to backend; triggers LLM replanning to propose alternative lower-cost items. |
| INT-HITL-03 | Edit Action Modification           | Click "Edit Order", adjust item quantities or delete item from approval card. | Updates draft payload; refreshes card price summary; awaits confirmation.                      |
| INT-HITL-04 | Approval Timeout Expiration        | Leave `ApprovalCard` in pending state beyond TTL (5 minutes).                 | Card status changes to "Expired"; action buttons disabled; prompts user to re-initiate order.  |

落地登记（G3.3，QA 验收 2026-10-26，报告 `docs/reports/G3.3.md` §二）：INT-HITL-01~04 已落地，
`ApprovalCard.test.tsx` + `useAssistantStore.test.ts` 编号嵌标题；01 映射 E2E-AI-19、02 映射
E2E-AI-20、03 映射 E2E-AI-21（04 单测直造过期态）。实现口径说明：Expected Result 列的
「POST /api/orders」在 v0.4 架构下落地为「审批回放（approval-response part 重放 `/api/chat`）」，
edit 为「新 tool-call part 重发」；TTL 过期展示以客户端推导倒计时为准（帧无 expiresAt，报告 §三①）。

### 3.4 Assistant E2E (Playwright, `e2e/`，G1.4 / G2.3 落地)

mock 流用例（E2E-AI-01 ~ 08 为 G1.4，E2E-AI-10 ~ 13 为 G2.3 工具调用场景）全部走确定性 mock SSE
（`e2e/mock-bff.mjs`，按消息文本选场景，工具场景用 `/__release?gate=` 命名闸门停在中间态），
默认 `npm run test:e2e` 运行；E2E-AI-09 为 live 冒烟（`@live` 标签隔离），不进默认门禁，
需先 `npm run dev:bff` 再 `npm run test:e2e:live` 手动触发。
E2E-AI-18 为 G5.1 改造的目录页只读浏览用例（目录页首条，G3.1a 目录页加购入口已随
single-writer 收口下线）：catalog 数据来自远程绝对 URL，`page.route` 对该 URL 确定性回放
商品快照（不经 vite proxy / mock-bff）。
E2E-AI-25 为 G5.1 清空购物车用例（裁决①-b）：mock `__e2e_clear_cart__` 场景（clearCart
零入参回执 + 命名闸门 clear），与 `__e2e_cart__` 同模式。
E2E-AI-19~21 为 G3.3 订单审批闭环用例：`__e2e_order__` 有状态场景（首请求 → approval-request
停驻；第二请求按内容分流 approved / denied / 新 toolCall 三支续流），mock 门禁 17 → 20 条。

| ID        | Title                                     | Description                                                                                                                                                                                           | Expected Result                                                                                                                                                                                                   |
| --------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2E-AI-01 | Assistant Page Load                       | Navigate to `#/assistant`.                                                                                                                                                                            | 输入框 / 发送按钮可见，页面标题「AI 导购助手」渲染。                                                                                                                                                              |
| E2E-AI-02 | Incremental Streaming Render              | mock gated 场景：第一帧增量后停在闸门，断言中间态后放行剩余帧（映射 INT-AI-01 / A11Y-04）。                                                                                                           | 文本从「推荐」中间态增长为「推荐免费素材」（非一次性整段）；流式容器带 `aria-live="polite"`；流结束后输入框恢复可用。                                                                                             |
| E2E-AI-03 | Stop Streaming Mid-Flight                 | mock hang 场景：收到部分文本后点「停止」（映射 INT-AI-02）。                                                                                                                                          | 「已停止生成」提示条出现；输入框恢复可用；已收到部分文本保留；无错误横幅。                                                                                                                                        |
| E2E-AI-04 | Reasoning Collapse Toggle                 | mock reasoning 场景：reasoning-delta + text-delta 帧流。                                                                                                                                              | 折叠区默认收起、标题「思考过程」、内容不可见；点击展开后 reasoning 内容可见。                                                                                                                                     |
| E2E-AI-05 | Smart Scroll Follow                       | mock long 场景：40 帧长文（50ms/帧）撑出滚动条。                                                                                                                                                      | 流式中上滑后 scrollTop 不被抢（< 40px 漂移）；回到底部后恢复跟随，流结束时停在底部（距底 < 40px）。                                                                                                               |
| E2E-AI-06 | Error Banner on Network Failure           | `page.route` 对 `/api/chat` 执行 `route.abort()` 模拟断网。                                                                                                                                           | 错误横幅「无法连接服务器，请检查网络后重试」；不白屏，输入框恢复可用。                                                                                                                                            |
| E2E-AI-07 | Error Banner on HTTP 502                  | `route.fulfill` 返 502 HTML（= dev 停 BFF 时 Vite proxy 行为）。                                                                                                                                      | 错误横幅含「HTTP 502」；输入框恢复可用。                                                                                                                                                                          |
| E2E-AI-08 | Error Banner on Stream error Chunk        | mock error_chunk 场景：部分正文后推 `{"type":"error","errorText":"上游模型服务错误（HTTP 500）"}`。                                                                                                   | 错误横幅显示该 errorText；已收到部分文本保留；输入框恢复可用。                                                                                                                                                    |
| E2E-AI-09 | Live Smoke (manual, not in gate)          | 真打 BFF + 上游 LLM 发「请用三句话介绍你自己」（`@live` 标签，`playwright.live.config.ts`）。                                                                                                         | 首个增量文本出现后最终文本更长（增量渲染）；流正常结束、输入框恢复可用；无错误横幅。                                                                                                                              |
| E2E-AI-10 | Tool Card Live Display                    | mock `__e2e_tool__` 场景 + 双命名闸门：pre 放行工具输入帧、post 放行输出帧（映射 INT-AI-03）。                                                                                                        | 闸门停在执行中：工具名 / 格式化参数 / spinner 态 / 不显示耗时；放行后成功态 + 耗时（ms）+ 回复完成、输入恢复。                                                                                                    |
| E2E-AI-11 | Status Projection Sequence                | mock `__e2e_tool__` 场景：轮询 badge 文案逐步变化（映射 INT-AI-05）。                                                                                                                                 | badge 随 thinking → tool_calling → tool_result → streaming → done 逐态投影（调用工具 / 工具结果 / 生成回复 / 已完成）。                                                                                           |
| E2E-AI-12 | Stop While Tool Running                   | mock `__e2e_tool_hang__` 场景：工具执行中点「停止」（映射 INT-AI-02）。                                                                                                                               | 「已停止生成」提示出现；**无 alert 错误横幅**（取消 ≠ 失败）；输入框恢复可用。                                                                                                                                    |
| E2E-AI-13 | Tool Failure Recovery                     | mock `__e2e_tool_error__` 场景：tool-output-error 帧（errorText「catalog snapshot unavailable」）。                                                                                                   | 错误横幅含「工具调用失败」+ 上游 errorText；输入恢复；error 后再发新消息走 RETRY → USER_SEND 正常回复、横幅消失。                                                                                                 |
| E2E-AI-14 | Generative UI Real Product Cards          | mock `__e2e_tool_ui__` 场景：searchCatalog 输出 2 件商品（映射 INT-AI-04 / 裁决⑥）。                                                                                                                  | 气泡内渲染存量 ProductGrid + 2 张真实 ProductCard（aria-label 结构 / 标题 / 价格文本）；计算样式 grid 列数 = 2。                                                                                                  |
| E2E-AI-15 | Generative UI Unregistered Fallback       | mock `__e2e_tool_unknown__` 场景：deleteAccount 工具输出（映射 UT-REG-02 E2E 侧）。                                                                                                                   | 气泡内无商品卡；出现 fallback 文本「暂不支持展示该工具的结果」；回复正常完成、输入恢复。                                                                                                                          |
| E2E-AI-16 | Add to Cart Journey                       | mock `__e2e_cart__` 场景：addToCart 工具回执（映射 UT-CART-01）。                                                                                                                                     | 回执后 drawer 自动打开、条目（标题/数量/小计）正确；关闭后 badge 计数正确；badge 点击重开 drawer。                                                                                                                |
| E2E-AI-17 | Cart Readonly Projection & Persist (G5.1) | mock `__e2e_cart__` 场景：加购回执 → drawer 只读校验（映射 UT-CART-02/03）。                                                                                                                          | 数量 / 小计 / 合计正确；drawer 无步进 / 删除 / 清空写控件（single-writer）；`page.reload()` 后 badge 计数与 drawer 内容从 localStorage 恢复（persist 浏览器侧实证）。                                             |
| E2E-AI-18 | Catalog Page Readonly Browsing (G5.1)     | `page.route` 回放远程商品绝对 URL 2 件快照（目录页首条用例，不经 mock-bff）。                                                                                                                         | 回放数据落卡（存量 ProductCard 形态）；目录页**无**加购按钮、badge 初始为 0（浏览归人、交易归 AI）；assistant 页 AI 加购后回目录页 badge 可见（persist 跨页实证）；badge 重开 drawer 见只读条目与合计。           |
| E2E-AI-19 | Approval Closed Loop (Approve)            | mock `__e2e_order__` 场景：首请求 → 正文 + tool-approval-request 停驻；approve 后第二请求回放 → 执行回执 + 订单号（映射 INT-HITL-01）。                                                               | badge 投影序列含「等待确认」（await_human 首次真实可达）；审批卡渲染（单号 / 倒计时 / 条目）；approve → 订单回执卡 + 订单号 + 回复完成、输入恢复。                                                                |
| E2E-AI-20 | Reject & LLM Correction                   | mock `__e2e_order__` 场景：reject（原因「太贵了」）→ 第二请求回放 → tool-output-denied → 修正文本出现（映射 INT-HITL-02）。                                                                           | 卡展示拒绝原因；denied 复放后续跑生成修正方案（修正文本断言）；回复完成、输入恢复。                                                                                                                               |
| E2E-AI-21 | Edit & Re-initiate                        | mock `__e2e_order__` 场景：卡内改数量 / 移除条目 → 第二请求含新 toolCall part（不发审批响应）→ 新 tool-approval-request → 新审批卡替换旧卡（旧卡失效提示），经新卡 approve 完成（映射 INT-HITL-03）。 | edit 重发形态断言（新 toolCallId + 修改后 items）；旧卡「已修改并重新发起」提示；新卡 approve → 订单号闭环。                                                                                                      |
| E2E-AI-25 | Clear Cart (G5.1 裁决①-b)                 | mock `__e2e_clear_cart__` 场景：clearCart 零入参工具回执（命名闸门 clear，先加购再清空）。                                                                                                            | 闸门 clear 放行前购物车保持原状（反向断言）；回执应用后购物车归零 + drawer 自动打开（镜像 addToCart 接线）、空态 + 合计 $0.00 + 气泡内「✓ 已清空购物车」确认卡；badge 归零；`page.reload()` 后 persist 恢复空车。 |

---

## 4. Accessibility (A11y)

| ID      | Title                              | Description                                             | Expected Result                                                            |
| ------- | ---------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| A11Y-01 | Semantic HTML                      | Verify usage of main, section, header, nav tags.        | Landmark regions correctly identified.                                     |
| A11Y-02 | Input Labels                       | Check Search and Filter inputs for aria-labels/labels.  | Screen readers can identify input purpose.                                 |
| A11Y-03 | Focus Management                   | Interact with filters using keyboard.                   | Visible focus ring on interactive elements.                                |
| A11Y-04 | Agent Status ARIA Live Region      | State transitions during `thinking` and `tool_calling`. | `aria-live="polite"` region notifies assistive tech of background actions. |
| A11Y-05 | HITL Modal & Dialog Focus Trapping | Display `ApprovalCard` for pending order decision.      | Focus moves into approval dialog; keyboard Tab/Shift+Tab cycles trapped.   |

---

## 5. API Resilience & Security (External API & BFF)

### 5.1 Catalog External API

| ID     | Title               | Description                                    | Expected Result                                     |
| ------ | ------------------- | ---------------------------------------------- | --------------------------------------------------- |
| API-01 | Retry Logic         | Mock 2 consecutive failures then 1 success.    | UI should succeed after retries (3 attempts total). |
| API-02 | Error Normalization | API returns malformed JSON or 500.             | ErrorState shown with meaningful message.           |
| API-03 | Field Validation    | Mock items missing required fields (e.g., id). | App should handle gracefully (skip or default).     |

### 5.2 AI Assistant BFF & Tool Security (`server/`)

| ID        | Title                                | Description                                                                       | Expected Result                                                                                                                       |
| --------- | ------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| API-AI-01 | Unapproved PlaceOrder Interception   | Client directly invokes `placeOrder` endpoint without prior approved status.      | BFF rejects request with HTTP 403 / unapproved error; no order is created.                                                            |
| API-AI-02 | Single-Channel Routing + Price Range | Prompt "under $20" vs "cyberpunk game cover art".                                 | Both route to `searchCatalog`: `{ maxPrice: 20 }` vs LLM query-understanding → `{ query: 'cyberpunk' }` (no vector retrieval exists). |
| API-AI-03 | Upstream LLM Timeout & Error 500     | Upstream OpenAI-compatible API times out or responds with HTTP 500/429.           | BFF outputs standardized SSE error event; frontend cleanly captures error without breaking UI.                                        |
| API-AI-04 | Order Persistence & Status Recovery  | Query order status by `orderId` after client browser refresh or disconnect.       | BFF returns current `pending`/`approved`/`expired` state from the order table, enabling recovery.                                     |
| API-AI-05 | Approval TTL via `toolApproval`      | Replay an approval response after its TTL has elapsed.                            | `toolApproval` callback rejects it with `{ type: 'denied', reason: 'approval expired' }`.                                             |
| API-AI-06 | Forged Approval Interception         | Craft a valid-looking `tool-approval-response` client-side (no server signature). | BFF rejects it before execution (HMAC signature mismatch); no order is created.                                                       |

落地登记（G3.2，QA 验收 2026-10-25，报告 `docs/reports/G3.2.md` §二）：API-AI-01 / API-AI-04 /
API-AI-05 / API-AI-06 已在 server 侧落地（编号嵌测试标题 + curl 实证），执行状态见
`docs/regression-index.md` §2.3。注意 API-AI-01 落地形态为工具输出体 `{ error }`（沿用工具
错误契约）而非 HTTP 403——以 Expected Result 的「无订单产生」安全语义为准。

---

## 6. Automation & DoD Plan

- Execute `npm test` or `vitest run` on PR and push.
- Keep all 27 baseline catalog tests passing (0 regressions).
- AI-layer target after v0.4: **≥45 total** (27 baseline + state machine 7 + registry 4 + transport 2 + approval/TTL 5) — target value, to be filled with measured count at G4.
- Target test coverage for state machine and registry: 100% path coverage.
- Overall assistant business logic test coverage target: > 90%.
