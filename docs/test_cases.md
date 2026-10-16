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
| UT-REG-01 | Whitelist Component Dispatch   | Pass valid registered payload for `productGrid` or `priceSummary`.                               | Component resolves and renders with validated props matching JSON Schema.                     |
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

| ID         | Title                 | Description                                                | Expected Result                                                               |
| ---------- | --------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| UT-CART-01 | Add & Quantity Merge  | Add existing product multiple times via `addToCart`.       | Cart merges quantities of duplicate product ID; updates item count correctly. |
| UT-CART-02 | Remove & Clear Cart   | Remove single item or clear entire cart.                   | Item removed or cart emptied; total price recalculated to 0.                  |
| UT-CART-03 | Total & Price Summary | Calculate totals with mixed items (free, paid, view-only). | Accurately computes subtotal and formatted display prices.                    |

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

---

## 6. Automation & DoD Plan

- Execute `npm test` or `vitest run` on PR and push.
- Keep all 27 baseline catalog tests passing (0 regressions).
- AI-layer target after v0.4: **≥45 total** (27 baseline + state machine 7 + registry 4 + transport 2 + approval/TTL 5) — target value, to be filled with measured count at G4.
- Target test coverage for state machine and registry: 100% path coverage.
- Overall assistant business logic test coverage target: > 90%.
