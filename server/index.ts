import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { z } from 'zod';
import { chatApp } from './chat.js';
import { env } from './env.js';
import { orderStore } from './orders.js';
import { toolRegistry, type ToolName } from './tools/index.js';

const app = new Hono();

app.use('/api/*', cors({ origin: 'http://localhost:5173' }));

/** 返回 BFF 存活状态与模型配置可见性。 */
function healthHandler(c: Context) {
    return c.json({
        status: 'ok',
        service: 'connect-store-bff',
        uptimeMs: Math.floor(process.uptime() * 1000),
        llmConfigured: env.llmConfigured,
    });
}

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.route('/api', chatApp);

/** dev 工具直调端点请求体上限，沿用 /api/chat 的 1 MB 口径。 */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * dev 工具直调端点：POST /api/tools/:toolName（工具契约的确定性验收面，与 LLM 解耦）。
 * 安全语义：只有同时命中 env.toolsDirectAllow（TOOLS_DIRECT_ALLOW ∩ 注册表 key，
 * 再剔除 APPROVAL_GATED 审批门控黑名单）的 toolName 才放行，其余一律 404
 * （与未知工具同行为，不暴露工具存在性）；
 * 生产不设置该变量 = 白名单为空 = 任何工具都不能绕过 HITL 审批被直接调用。
 * 审批门控互斥是代码级检查（env.ts APPROVAL_GATED，裁决⑦）：placeOrder 注册进
 * 注册表后即使被显式写入 TOOLS_DIRECT_ALLOW 也恒 404 —— vitest 与 curl 双重实证。
 */
app.post(
    '/api/tools/:toolName',
    bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) => c.json({ error: 'request body too large' }, 413),
    }),
    async (c) => {
        const toolName = c.req.param('toolName');
        if (!env.toolsDirectAllow.includes(toolName)) {
            return c.json({ error: 'tool not found' }, 404);
        }

        // toolsDirectAllow 已与注册表 key 取过交集，这里必命中。
        const definition = toolRegistry[toolName as ToolName];

        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return c.json({ error: 'invalid JSON body' }, 400);
        }

        // 注册表约定：所有工具的 inputSchema 均为 Zod schema（见 tools/index.ts），直调时 safeParse。
        const inputSchema = definition.inputSchema as z.ZodType;
        const parsed = inputSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: 'invalid tool input', issues: parsed.error.issues }, 400);
        }

        // 三份工具定义的 execute 均为「同步返回 JSON 可序列化结果」，入参即 Zod 校验输出；
        // SDK 的 ToolExecuteFunction 联合了 AsyncIterable 返回形态，这里按本 G 约定收窄。
        const execute = definition.execute as unknown as (
            input: unknown,
            options: {
                toolCallId: string;
                messages: [];
                abortSignal: AbortSignal;
                context: Record<string, unknown>;
            },
        ) => unknown;
        const output = await execute(parsed.data, {
            toolCallId: `direct-${Date.now().toString(36)}`,
            messages: [],
            abortSignal: c.req.raw.signal,
            context: {},
        });
        return c.json(output, 200);
    },
);

/**
 * GET /api/orders/:orderId（G3.2，API-AI-04）：按 orderId 查询订单当前状态。
 * 惰性过期（design §6.3 判定点②）：pending 超 TTL → 落 expired + 审计后返回；
 * 未知 orderId 一律 404（不暴露存在性）。断线/刷新后前端可凭 orderId 恢复审批状态。
 */
app.get('/api/orders/:orderId', (c) => {
    const order = orderStore.queryOrder(c.req.param('orderId'), Date.now());
    if (order === undefined) {
        return c.json({ error: 'order not found' }, 404);
    }
    return c.json(order);
});

serve({ fetch: app.fetch, port: env.port });
