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
