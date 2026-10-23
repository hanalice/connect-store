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
