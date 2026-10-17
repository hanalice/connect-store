# `toolApproval` 内 TTL 判定最小实测

> 记录日期：2026-10-17。结论：**可行**。审批响应复放时，AI SDK 会重新调用 `toolApproval`；过期判定返回 `{ type: 'denied', reason: 'approval expired' }` 后，SDK 生成 `execution-denied` 工具输出，且不执行工具。

## 1. 实验设置

- 脚本：`server/ttl-approval-experiment.mjs`。
- 运行命令：在 `server/` 下执行 `npm run test:ttl`。
- 依赖：Node.js v22.23.1、`ai@7.0.142`、`zod@4.6.7`。
- Mock 方式：`ai/test` 的 `MockLanguageModelV4`。第一次 `doGenerate` 返回 `placeOrder` tool call，第二次返回固定文本；未连接真实 LLM，未读取或申请 API key，API 成本为 0。
- 审批协议：`ToolLoopAgent` + `toolApproval` + `experimental_toolApprovalSecret`。首次结果包含带签名的 `tool-approval-request`；随后把 `responseMessages` 与 `tool-approval-response` 加入消息历史，再次调用 `agent.generate({ messages })` 完成复放。
- TTL 表：实验进程内 `Map` 按 `toolCallId` 保存签发时刻。回调首次返回 `user-approval`；复放时按当前时刻与签发时刻之差返回 `approved` 或 `denied`。
- 时间口径：TTL 推导为 `5 min × 60 s/min × 1,000 ms/s = 300,000 ms`。未过期路径经过 300,000 ms，过期路径经过 `300,000 ms + 1 ms = 300,001 ms`；通过可控时钟变量推进，未实际等待。
- 自动断言：审批前执行次数为 0；未过期复放执行次数为 1 并返回订单工具结果；过期复放执行次数为 0，且 SDK 响应消息包含 `execution-denied` 与 `approval expired`。
- 覆盖边界：验证的是 `ToolLoopAgent.generate` 的核心消息复放路径；未测浏览器、`useChat`、SSE UI 流或真实模型。

## 2. 真实运行输出

以下为同一次 `npm run test:ttl` stdout 的原样关键字段；仅省略重复出现的 `replayContent` 和最后的 assistant 固定文本消息，未改动所列值。

```json
{
  "ttlMs": 300000,
  "unexpired": {
    "elapsedMs": 300000,
    "initialApproval": {
      "type": "tool-approval-request",
      "hasSignature": true
    },
    "policyDecisions": [{ "type": "user-approval" }, { "type": "approved" }],
    "toolExecutions": 1,
    "replayResponseMessages": [
      {
        "role": "tool",
        "content": [
          {
            "type": "tool-result",
            "toolCallId": "call-ttl-1",
            "toolName": "placeOrder",
            "output": {
              "type": "json",
              "value": {
                "orderId": "order-ttl-1",
                "status": "executed"
              }
            }
          }
        ]
      }
    ]
  },
  "expired": {
    "elapsedMs": 300001,
    "initialApproval": {
      "type": "tool-approval-request",
      "hasSignature": true
    },
    "policyDecisions": [
      { "type": "user-approval" },
      { "type": "denied", "reason": "approval expired" }
    ],
    "toolExecutions": 0,
    "replayResponseMessages": [
      {
        "role": "tool",
        "content": [
          {
            "type": "tool-result",
            "toolCallId": "call-ttl-1",
            "toolName": "placeOrder",
            "output": {
              "type": "execution-denied",
              "reason": "approval expired"
            }
          }
        ]
      }
    ]
  },
  "conclusion": "PASS"
}
```

完整脚本会在打印上述输出前执行全部断言；任何一条不满足都会以非零退出码终止，不会打印 `PASS`。文档编写前又连续复跑 3 次，3 次均以退出码 0 完成。

## 3. 结论与依据

**可行，G3 可继续采用 design §6.2 的 SDK 原生审批协议 + 自维护签发时刻表方案。**

依据不是推测：

1. 两条路径的 `policyDecisions` 都出现第二次策略判定，证明审批响应复放触发了 `toolApproval` 重估。
2. 未过期路径的 SDK `tool-result.output` 是真实 `placeOrder` 返回值，且执行次数为 1。
3. 过期路径的 SDK `tool-result.output` 为 `{ type: 'execution-denied', reason: 'approval expired' }`，且执行次数为 0。
4. 两条路径首次审批请求均带签名，复放在启用 `experimental_toolApprovalSecret` 的情况下完成。
