import { createDeepSeek } from '@ai-sdk/deepseek';
import {
    APICallError,
    convertToModelMessages,
    createUIMessageStreamResponse,
    stepCountIs,
    streamText,
    toUIMessageStream,
    type UIMessage,
} from 'ai';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { CHAT_SYSTEM_PROMPT } from './chat-prompt.js';
import { approvalPolicy } from './approvals.js';
import { env } from './env.js';
import { toolRegistry } from './tools/index.js';

/** 请求体上限 1 MB（design §8 安全项），超限返回 413。 */
const MAX_BODY_BYTES = 1024 * 1024;

/** 上游单次调用总超时，防止浏览器连接被无限挂起。 */
const UPSTREAM_TIMEOUT_MS = 60_000;

/** 请求体最小结构校验：只卡 role 枚举与 parts 数组形状，不绑定 SDK 内部类型。 */
const chatRequestSchema = z.object({
    messages: z.array(
        z.object({
            role: z.enum(['system', 'user', 'assistant']),
            parts: z.array(z.looseObject({ type: z.string() })),
        }),
    ),
});

/**
 * 把上游异常格式化为面向客户端的标准化错误文本。
 * 用 `isInstance` 而不是 `instanceof`：`@ai-sdk/deepseek` 自带一份 provider，
 * 抛出的 APICallError 与 `ai` 再导出的类不是同一个构造函数。
 * 不回传 error.message / responseBody，避免上游把 key 片段回显给客户端。
 */
function formatUpstreamError(error: unknown): string {
    if (APICallError.isInstance(error)) {
        const status = error.statusCode ?? 'unknown';
        return `上游模型服务错误（HTTP ${status}）`;
    }
    return '上游模型服务异常，请稍后重试';
}

/** 只记录状态码。streamText 默认 onError 会 console.error 整个错误对象，responseBody 可能含 key 片段。 */
function logUpstreamError(error: unknown): void {
    const status = APICallError.isInstance(error) ? error.statusCode : undefined;
    console.error(`[chat] 上游模型服务错误: HTTP ${status ?? 'unknown'}`);
}

/** POST /api/chat：缺配置 503 → 结构校验 400 → streamText（含 tools 工具回路）输出官方 UI 消息流。 */
export const chatApp = new Hono().post(
    '/chat',
    bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) => c.json({ error: 'request body too large' }, 413),
    }),
    async (c) => {
        if (!env.llmConfigured || !env.llmModel) {
            return c.json({ error: 'LLM not configured' }, 503);
        }

        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return c.json({ error: 'invalid JSON body' }, 400);
        }

        const parsed = chatRequestSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: 'invalid messages structure' }, 400);
        }

        const deepseek = createDeepSeek({
            apiKey: env.llmApiKey,
            baseURL: env.llmBaseUrl,
        });

        const result = streamText({
            model: deepseek(env.llmModel),
            messages: await convertToModelMessages(parsed.data.messages as Omit<UIMessage, 'id'>[]),
            // system prompt：角色 + Free/View Only 价格语义（G2.1 §五③）+ 工具使用约束
            system: CHAT_SYSTEM_PROMPT,
            // 工具回路：直接引用 G2.1 注册表（A7 唯一一份，禁止复制工具定义）；
            // ai@7 streamText 默认 stopWhen=isStepCount(1) 不跑工具环，须显式放开步数
            tools: toolRegistry,
            // HITL（G3.2，ADR D9）：SDK 原生 toolApproval 策略 —— placeOrder 恒
            // 'user-approval'（缺 APPROVAL_SECRET 时策略 denied，工具不执行）；
            // experimental_toolApprovalSecret 把审批 HMAC 签名绑定到服务端签发的
            // toolName + toolCallId + input，伪造审批在复放校验期被 SDK 拦截（API-AI-06）。
            toolApproval: approvalPolicy.toolApproval,
            experimental_toolApprovalSecret: env.approvalSecret,
            stopWhen: stepCountIs(5),
            timeout: UPSTREAM_TIMEOUT_MS,
            onError: ({ error }) => {
                logUpstreamError(error);
            },
        });

        return createUIMessageStreamResponse({
            stream: toUIMessageStream({
                stream: result.stream,
                onError: (error) => formatUpstreamError(error),
            }),
        });
    },
);
