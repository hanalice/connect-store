import assert from 'node:assert/strict';
import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const TTL_MS = 5 * 60 * 1000;
const ISSUED_AT_MS = 1_000_000;
const USAGE = {
    inputTokens: {
        total: 0,
        noCache: 0,
        cacheRead: undefined,
        cacheWrite: undefined,
    },
    outputTokens: {
        total: 0,
        text: 0,
        reasoning: undefined,
    },
};

/** 运行一次独立的审批复放场景，并返回可核对的真实结果。 */
async function runScenario(elapsedMs) {
    let nowMs = ISSUED_AT_MS;
    let toolExecutions = 0;
    const issuedAtByToolCall = new Map();
    const policyDecisions = [];

    const model = new MockLanguageModelV4({
        doGenerate: [
            {
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'call-ttl-1',
                        toolName: 'placeOrder',
                        input: JSON.stringify({ orderId: 'order-ttl-1' }),
                    },
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
                usage: USAGE,
                warnings: [],
            },
            {
                content: [{ type: 'text', text: 'mock loop finished' }],
                finishReason: { unified: 'stop', raw: undefined },
                usage: USAGE,
                warnings: [],
            },
        ],
    });

    const agent = new ToolLoopAgent({
        model,
        experimental_toolApprovalSecret: 'ttl-experiment-only-32-byte-secret',
        tools: {
            placeOrder: tool({
                inputSchema: z.object({ orderId: z.string() }),
                execute: async ({ orderId }) => {
                    toolExecutions += 1;
                    return { orderId, status: 'executed' };
                },
            }),
        },
        toolApproval: ({ toolCall }) => {
            const issuedAt = issuedAtByToolCall.get(toolCall.toolCallId);
            if (issuedAt === undefined) {
                issuedAtByToolCall.set(toolCall.toolCallId, nowMs);
                policyDecisions.push({ type: 'user-approval' });
                return 'user-approval';
            }

            const decision =
                nowMs - issuedAt > TTL_MS
                    ? { type: 'denied', reason: 'approval expired' }
                    : { type: 'approved' };
            policyDecisions.push(decision);
            return decision;
        },
    });

    const messages = [{ role: 'user', content: 'place the order' }];
    const initialResult = await agent.generate({ messages });
    messages.push(...initialResult.responseMessages);

    const approvalRequest = initialResult.content.find(
        (part) => part.type === 'tool-approval-request' && !part.isAutomatic,
    );
    assert.ok(approvalRequest, '首次调用必须产生人工审批请求');
    assert.equal(toolExecutions, 0, '审批前不得执行工具');

    nowMs += elapsedMs;
    messages.push({
        role: 'tool',
        content: [
            {
                type: 'tool-approval-response',
                approvalId: approvalRequest.approvalId,
                approved: true,
            },
        ],
    });

    const replayResult = await agent.generate({ messages });
    return {
        elapsedMs,
        initialApproval: {
            type: approvalRequest.type,
            isAutomatic: approvalRequest.isAutomatic,
            hasSignature: typeof approvalRequest.signature === 'string',
        },
        policyDecisions,
        toolExecutions,
        replayContent: replayResult.content,
        replayResponseMessages: replayResult.responseMessages,
    };
}

/** 执行未过期与已过期两条路径，并断言 TTL 判定在复放时生效。 */
const unexpired = await runScenario(TTL_MS);
const expired = await runScenario(TTL_MS + 1);

assert.equal(unexpired.toolExecutions, 1, '未过期审批复放必须执行工具');
assert.deepEqual(unexpired.policyDecisions, [{ type: 'user-approval' }, { type: 'approved' }]);
assert.deepEqual(unexpired.replayResponseMessages[0].content[0].output, {
    type: 'json',
    value: { orderId: 'order-ttl-1', status: 'executed' },
});
assert.equal(expired.toolExecutions, 0, '已过期审批复放不得执行工具');
assert.deepEqual(expired.policyDecisions, [
    { type: 'user-approval' },
    { type: 'denied', reason: 'approval expired' },
]);
assert.deepEqual(expired.replayResponseMessages[0].content[0].output, {
    type: 'execution-denied',
    reason: 'approval expired',
});

console.log(
    JSON.stringify(
        {
            ttlMs: TTL_MS,
            unexpired,
            expired,
            conclusion: 'PASS',
        },
        null,
        2,
    ),
);
