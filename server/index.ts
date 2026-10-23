import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { z } from 'zod';
import { chatApp } from './chat.js';
import { env } from './env.js';
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
 * 安全语义：只有同时命中 env.toolsDirectAllow（TOOLS_DIRECT_ALLOW ∩ 注册表 key）的
 * toolName 才放行，其余一律 404（与未知工具同行为，不暴露工具存在性）；
 * 生产不设置该变量 = 白名单为空 = 任何工具都不能绕过 HITL 审批被直接调用。
 * 审批门控工具（未来 placeOrder，G3.2）永远不得加入白名单。
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

serve({ fetch: app.fetch, port: env.port });
