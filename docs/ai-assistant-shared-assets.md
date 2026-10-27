# AI 导购工程通用资产登记处

> 用途：登记跨 G 任务可复用的工程资产（模式 / 工具函数 / 测试技法），
> 每个 G 完成后由 QA 在阶段报告第四节写摘要、在此处追加详情。
> 条目格式：**名称 / 来源任务 / 解决什么问题 / 复用方式 / 代码位置**。
> 关联：`docs/maf-automation-plan.md` §4.2。

---

## A1. 自研传输层错误三分类模式

- **来源任务**：G1.3
- **解决什么问题**：流式请求的失败形态不止一种——网络失败（fetch TypeError）、
  非 2xx（含 dev 环境 Vite proxy 返 502）、流中途断开（reader.read 抛错）需要区分文案；
  主动取消（AbortError）必须与失败分开，否则对用户自己的取消误报错误。
- **复用方式**：`ChatApiError{kind, status?}` + 取消走 `DOMException('AbortError')`；
  G3.4 失败恢复、任何新增流式端点直接沿用。
- **代码位置**：`src/features/assistant/services/chatApi.ts`

## A2. SSE 受控流单测构造法

- **来源任务**：G1.3
- **解决什么问题**：LLM 是不确定依赖，流式逻辑的单测必须确定性。
- **复用方式**：`new ReadableStream` 手动 enqueue `data: {JSON}\n\n` 帧（含 `[DONE]` 哨兵、
  中途 `controller.error()` 断流、永不结束流配 abort），官方 `parseJsonEventStream` +
  `uiMessageChunkSchema` 负责解析与校验，测试只断言投影结果。
  Playwright `page.route` 回放 SSE 是同一思路的浏览器版。
- **代码位置**：`src/features/assistant/services/chatApi.test.ts`

## A3. 智能滚动阈值模式

- **来源任务**：G1.3
- **解决什么问题**：流式 UI 的自动滚动会打断正在往上翻阅读的用户。
- **复用方式**：scroll 监听里用 `scrollHeight - scrollTop - clientHeight < 阈值(40px)`
  记录「是否在底部」到 ref，内容变化时仅当在底部才 `scrollTop = scrollHeight`；
  发送新消息时强制归底。任何流式/日志类列表可直接搬。
- **代码位置**：`src/features/assistant/components/ChatPanel.tsx`

## A4. Zustand 模块级 AbortController + 代际竞态防护

- **来源任务**：G1.3
- **解决什么问题**：store action 里的异步请求被「停止/新请求」打断时，
  旧请求的收尾（catch/finally）会覆盖新请求状态。
- **复用方式**：模块级 `currentController`；新请求先 abort 旧的再替换；
  catch 开头判 `currentController.signal !== signal` 则直接 return（旧代际不碰状态）；
  finally 里仅当还是自己时才清空。与存量 `useCatalogStore` 模式同源。
- **代码位置**：`src/features/assistant/state/useAssistantStore.ts`

## A5. Playwright mock BFF 受控流回放模式

- **来源任务**：G1.4
- **解决什么问题**：浏览器端流式 UI 的 E2E 需要断言「逐块增量渲染」的中间态，而
  Playwright `route.fulfill` 一次性交付 body，中间态不可见；真实 LLM 又是不确定依赖，
  不能进默认门禁。
- **复用方式**：本地 mock BFF（8787 端口，纯 `node:http`，零依赖）作为 Playwright
  `webServer` 拉起；按请求最后一条 user 消息文本里的场景标记（`__e2e_xxx__`）选择
  固定帧序列下发受控 SSE（UIMessageChunk 帧 + `[DONE]` 哨兵）。
  `reuseExistingServer: false` 防止端口被真实 BFF 占用时静默复用。G2+ 新增流类型
  （tool call 等）时在 mock-bff.mjs 加场景函数即可。
- **代码位置**：`e2e/mock-bff.mjs`、`playwright.config.ts`（webServer 配置）
- **G4.1 补注（裁决②根因修复）**：mock 监听端口原硬编码 `8787`，测试控制面
  `/__release` 也硬编码 8787——临时端口 harness 下控制面永远打不到 mock（数据面
  经代理正常、控制面直连 404/ECONNREFUSED，5 个闸门用例确定性失败，G3.4 §二⑦ 悬案）。
  现两端同读 `E2E_MOCK_PORT`（默认 8787），`playwright.config.ts` webServer 端口探测
  同步；G4.1 Q-D-01 补丁后 `vite.config.ts` 的 `/api` 代理 target 同读该变量（数据面
  第三腿，此前裸 `E2E_MOCK_PORT=18787 npm run test:e2e` 数据面 502 全灭）。
  **教训：控制面与数据面端口必须同源可配，只改一端必 flake。**

## A6. /\_\_release 闸门中间态断言法

- **来源任务**：G1.4
- **解决什么问题**：断言流式中间态若靠固定 sleep 赌时序会 flake；需要确定性地让流
  「停在某一中间帧」供断言后再继续。
- **复用方式**：受控流在首帧增量后 await 一个闸门 Promise；测试断言中间态后
  `fetch('http://localhost:8787/__release')` 放行剩余帧，再断言终态与
  `finalText.startsWith(midwayText)`。连接被客户端关闭（abort/teardown）时 waiter 自动
  解除避免悬挂；需 `workers: 1` 避免跨用例闸门串扰。任何「先断言中间态再放行」的
  流式 E2E 可照搬。
- **代码位置**：`e2e/mock-bff.mjs`（waitForRelease / `/__release` 端点）、
  `e2e/assistant.e2e.ts`（E2E-AI-02）
- **G2.3 补注（命名闸门增强）**：单闸门升级为 `?gate=<name>` 命名闸门（pre/post/cart），
  release 置位语义（release 先于 wait 不丢、新 `/api/chat` 请求清置位）；E2E-AI-10/11
  （tool 双闸门）/ 16/17（cart 闸门）依赖。任何「同一用例多停顿点」的受控流照搬命名闸门。

## A7. BFF 工具契约 dev 直调端点 + env 白名单模式

- **来源任务**：G2.1
- **解决什么问题**：工具层交付早于 `/api/chat` 工具回路（G2.3）时，curl 验收没有 HTTP 落点
  物理上不可执行；同时直调端点若默认放开，会成为绕过 HITL 审批的调用面（未来 placeOrder）。
- **复用方式**：工具注册表全项目唯一一份（dev 直调与 G2.3 工具回路共用，防两份定义漂移）；
  直调白名单 = env `TOOLS_DIRECT_ALLOW`（逗号分隔 → trim → 去空串）∩ 注册表 key，默认空 =
  生产语义（任何工具不可直调）；白名单外一律 404（与未知工具同行为，不暴露工具存在性）；
  行为契约 = 400 + Zod issues（入参非法）/ 413（1 MB body 上限）/ 200 + 工具返回；
  工具内部错误走 200 + `{error}` 字段（不静默 null，供 LLM 工具回路消费）。
  审批门控工具（placeOrder）永不入白名单（目前为注释级约束，G3.2 须升级为验收项）。
- **代码位置**：`server/index.ts`（`/api/tools/:toolName`）、`server/env.ts`
  （`parseToolsDirectAllow`）、`server/tools/index.ts`（注册表）

## A8. monorepo 外独立 package 的 vitest 隔离方案

- **来源任务**：G2.1
- **解决什么问题**：仓库内独立 package（如 `server/`，自己的 package.json / tsconfig / 测试）
  会被根 vitest 默认 include 扫入（污染根测试基线），且子包内跑 vitest 会向上继承根
  `vite.config.ts` 的 jsdom / setupFiles（直接跑挂）。
- **复用方式**：两条配套——① 根 `vite.config.ts` 加
  `test.exclude: [...configDefaults.exclude, '<子包>/**']`（注意保留 `configDefaults.exclude`，
  不要整体覆盖默认排除）；② 子包放一个**空** `export default defineConfig({})` 的
  `vitest.config.ts`，其存在意义就是阻断向上查找，文件内注释写明原因防被当冗余删掉。
  两条均经 QA 实测证伪（去掉①根测试 38→67；去掉②子包测试全 FAIL）。
- **代码位置**：`vite.config.ts`（test.exclude）、`server/vitest.config.ts`（空配置）

## A9. 表驱动纯函数状态机模式（数据 / 执行分离 + 显式拒绝 + 注入时钟 + 环形日志）

- **来源任务**：G2.2
- **解决什么问题**：状态机逻辑若散落在条件分支里，新增状态/边时无法静态审计、无法断言
  表规模；非法转换若静默吞掉，排查成本极高；含时间的日志逻辑用真实时钟无法确定性单测。
- **复用方式**：`TRANSITIONS` 纯数据表与 `send()` 执行逻辑分离，加边只改表数据，单测遍历
  表计数防施工期增删边；非法组合返回 `{state 不变, entry: null, rejected: true}` +
  `console.warn`（文案含 state/event），绝不静默；`now` 时钟注入（默认 `Date.now`）使
  `ts` 单调性可用假时钟逐条断言；日志环形缓冲 head+size 数组实现，`log` getter 输出
  oldest→newest 只读视图，驱逐语义（第 201 条起 FIFO 踢最旧）可精确对照首条 entry。
  任何后续需要"有限状态 + 审计日志"的纯逻辑层（审批 TTL、订单状态、registry 状态）
  可直接照搬此骨架。
- **代码位置**：`src/features/assistant/state/assistantMachine.ts`
  （单测范例 `assistantMachine.test.ts`：UT-ASM-07 拒绝 / UT-ASM-08 环形缓冲）

## A10. 状态投影表模式（状态 → UI 语义 Record 查表）

- **来源任务**：G2.3（报告 §四 已登记）
- **解决什么问题**：状态机的状态值若散落在 JSX 条件分支里渲染，新增状态时无法静态
  审计投影完整性；badge 文案/色调与状态一一对应，漏投影会在 UI 层静默 fallback。
- **复用方式**：`STATE_PROJECTION: Record<AssistantState, {label, tone}>` 单表查投影，
  UI 只消费投影结果；新增状态 = 表新增一行 + 投影全覆盖单测。与 A9 配套：
  A9 管「能不能转」，A10 管「转完长什么样」。
- **代码位置**：`src/features/assistant/components/AgentStatusBadge.tsx`（STATE_PROJECTION，
  :12）；单测 `AgentStatusBadge.test.tsx`（9 态投影）

## A11. 价格语义 system prompt 声明模式

- **来源任务**：G2.3（G2.1 §五③ 强制输入；报告 §四 已登记）
- **解决什么问题**：`pricingOption` 枚举（0/1/2 = 付费/免费/增值）是项目私有语义，
  LLM 无从知晓；不声明则模型按自然语言自由发挥，工具入参过滤错误率飙升。
- **复用方式**：system prompt 用结构化清单声明每个枚举值的含义与使用场景
  （预算约束 → 对应区间/枚举过滤）。任何「项目私有枚举进工具入参」的场景照搬——
  枚举语义必须进 prompt，不能只写 TS 类型。
- **代码位置**：`server/chat-prompt.ts`（价格语义声明节）

## A12. zod 运行时校验白名单模式（registry 输出契约）

- **来源任务**：G2.4（报告 §四 已登记）
- **解决什么问题**：Generative UI 渲染的数据来自 LLM 工具输出（不可信外部输入），
  直接渲染会让坏数据/畸形结构进组件；TS 类型在运行时归零。
- **复用方式**：registry 每类输出一份 zod schema（镜像存量 Product 契约），
  `safeParse` 失败 → 内联校验失败指示（不渲染坏数据）；输出体内 `{error}` 字段
  分流 → ToolError 卡片。schema 即白名单，未声明字段不进渲染层。
- **代码位置**：`src/features/assistant/registry/uiRegistry.tsx`（zod schema 节 :31 起）

## A13. 渲染双层防护（白名单查表 + ErrorBoundary）

- **来源任务**：G2.4（报告 §四 已登记）
- **解决什么问题**：单层防护各有洞——白名单查表挡不住「注册过的组件自己抛错」，
  ErrorBoundary 挡不住「未注册 toolName 渲染任意组件」。
- **复用方式**：第一层 registry 查表（未注册 → fallback 文本，绝不按 toolName 拼
  组件名，含 dynamic tool call）；第二层每类注册组件包 ErrorBoundary（渲染抛错 →
  本地化 fallback + 对话流不中断）。任何「按外部 key 动态选组件」的渲染层照搬。
- **代码位置**：`src/features/assistant/registry/uiRegistry.tsx`、`ToolError` 组件

## A14. E2E 计算样式列数断言法

- **来源任务**：G2.4（裁决⑥；报告 §四 已登记）
- **解决什么问题**：响应式网格「气泡内恒定 2 列」靠 CSS 媒体查询实现，E2E 无法靠
  截图/类名断言；视口变化下肉眼不可回归。
- **复用方式**：`getComputedStyle(el).gridTemplateColumns.split(' ').length` 用
  `expect.poll` 断言列数——断言浏览器计算后的真实布局，与实现方式（媒体查询/
  容器查询）解耦。
- **代码位置**：`e2e/assistant.e2e.ts`（E2E-AI-14）

## A15. ai SDK v7 帧协议事实（tool-output-available 无 toolName / toolCallId 反查）

- **来源任务**：G3.2 / G3.3（接线必读；报告 §四 已登记）
- **解决什么问题**：v7 的 `tool-output-available` 帧只带 `toolCallId + output`，
  不带 toolName；`approval-responded` 等帧协议字段形状与直觉不符，按旧版 SDK 经验
  接线会写错。
- **复用方式**：消费帧时从上下文（前序 input-available 帧 / 消息 parts）反查
  toolName 与 toolCallId，不指望输出帧自带；ai@7 UI 消息流消费方必读。
- **代码位置**：`src/features/assistant/services/chatApi.ts`（帧消费）、
  `server/chat-approval.integration.test.ts`（帧形状实证）

## A16. Zustand persist 落地惯例

- **来源任务**：G3.1（报告 §四 已登记）
- **解决什么问题**：购物车跨页/刷新恢复的 persist 配置细节（storage key 冲突、
  partialize 范围、version 迁移）没有惯例时每个 store 各写一套，易互相踩 key。
- **复用方式**：`persist(..., { name, partialize: 只持久化业务数据（UI 态如 drawer
开关不持久化）, version })` 三要素：唯一 name / partialize 白名单 / 显式 version；
  跨页同源恢复靠同一 storage key。
- **代码位置**：`src/features/cart/store/useCartStore.ts`（:26）

## A17. 审批协议帧字段实测口径

- **来源任务**：G3.2 / G3.3（报告 §四 已登记）
- **解决什么问题**：tool-approval-request 帧字段全集（approvalId / toolCallId /
  reason / signature）与 approval-responded 回放 part 的字段口径只有实测才可靠；
  `inputSchemaInput` 回环有 hasOwnProperty 陷阱——SDK 按 hasOwnProperty 判分支，
  补 `undefined` 会误走校验分支。
- **复用方式**：request 帧四字段全集签名（HMAC）；回放 part 仅回环原帧携带的字段
  （`in` 判断，绝不补 undefined）；TTL 判定用 `now > expiresAt`（边界 300,000ms
  通过 / 300,001ms 过期）。
- **代码位置**：`server/approvals.ts`、`src/features/assistant/services/chatApi.ts:68`
  （hasOwnProperty 注释）、`server/chat-approval.integration.test.ts`（API-AI-06 实证）

## A18. edit 重发形态（新 tool-call part 绕行）

- **来源任务**：G3.3（裁决③；报告 §四 已登记）
- **解决什么问题**：审批中的 edit 不能发 approval-responded（那会触发 approve/deny
  语义），需要「不发审批响应、带修改重新发起」的协议形态。
- **复用方式**：edit 走新 toolCall part（input-available 态，新 toolCallId + 修改后
  input）重新进入工具回路，服务端按新 toolCall 重新签发审批；客户端构造消息复用
  toRequestMessages 的 part 拼装，mock 侧按「新 toolCall 先登记、再挂起」回放。
- **代码位置**：`src/features/assistant/services/chatApi.ts`（edit 重发回放）、
  `e2e/mock-bff.mjs`（runOrderEdit 服务端形态）

## A19. badge/drawer 双通道触发 + accessible name 形态锁定单测法

- **来源任务**：G3.1 / G3.1a（报告 §四 已登记）
- **解决什么问题**：同一业务结果（加购）触发两处 UI 反应（badge 计数 + drawer
  自动打开），只测一处会漏联动回归；购物车角标 accessible name 形态
  （「购物车，N 件商品」）是 E2E 定位锚点，形态漂移即断全部用例。
- **复用方式**：组件单测锁 accessible name 形态，E2E 只消费锁定形态做旅程断言；
  双通道（角标/drawer）在同一用例内先后断言闭环。
- **代码位置**：`src/features/cart/components/CartBadge.test.tsx`、
  `e2e/assistant.e2e.ts`（E2E-AI-16 / 18）
