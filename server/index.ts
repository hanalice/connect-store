import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { env } from './env.js';

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

serve({ fetch: app.fetch, port: env.port });
