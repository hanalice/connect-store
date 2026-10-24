/**
 * E2E mock BFF（8787 端口）：按请求最后一条 user 消息文本里的场景标记下发受控 SSE。
 * 帧格式 = 官方 UI 消息流（UIMessageChunk）：`data: {JSON}\n\n` 帧 + `data: [DONE]\n\n` 哨兵，
 * Content-Type: text/event-stream。仅被 Playwright webServer 拉起，与 server/ 真实 BFF 无关。
 *
 * 场景标记（写在测试输入的消息文本里）：
 *   __e2e_gated__       增量渲染：发第一帧增量后停在闸门，等 GET /__release 再放行剩余帧
 *   __e2e_hang__        流挂起：发部分文本后永不结束，等客户端 abort 关闭连接
 *   __e2e_reasoning__   reasoning + 正文，快速发完
 *   __e2e_long__        40 帧长文（50ms/帧），制造滚动溢出
 *   __e2e_error_chunk__ 部分正文后推 error chunk
 *   __e2e_tool__        工具流（双命名闸门）：start → start-step → [闸门 pre] → tool-input-available
 *                       → [闸门 post] → tool-output-available → 正文 → finish
 *   __e2e_tool_hang__   工具流挂起：tool-input-available 后等客户端 abort 关闭连接
 *   __e2e_tool_error__  工具失败：tool-input-available → tool-output-error → finish
 *   其他                 默认快速短回复
 *
 * 闸门：GET /__release 放行全部（存量行为）；GET /__release?gate=<name> 只放行命名闸门。
 * 放行以「闸门名置位」实现（新 /api/chat 请求清空置位），release 先于 wait 到达也不会丢。
 */
import http from 'node:http';

const PORT = 8787;

/** 闸门等待者与已置位闸门名：release 先到时 wait 立即通过；新对话请求重置置位。 */
let releaseWaiters = [];
const releasedGates = new Set();

function writeFrame(res, frame) {
    res.write(`data: ${JSON.stringify(frame)}\n\n`);
}

function finishStream(res) {
    res.write('data: [DONE]\n\n');
    res.end();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseHead(res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
}

/**
 * 等待放行；连接被客户端关闭（abort / 测试 teardown）时也解除，避免悬挂。
 * 命名闸门（gate）：release 先于 wait 到达时靠 releasedGates 置位立即通过，不丢放行。
 */
function waitForRelease(res, gate = 'default') {
    return new Promise((resolve) => {
        if (releasedGates.has(gate) || releasedGates.has('*')) {
            resolve();
            return;
        }
        const waiter = { resolve, gate };
        releaseWaiters.push(waiter);
        res.on('close', () => {
            releaseWaiters = releaseWaiters.filter((w) => w !== waiter);
            resolve();
        });
    });
}

async function runGated(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    writeFrame(res, { type: 'text-start', id: 't1' });
    await sleep(50);
    writeFrame(res, { type: 'text-delta', id: 't1', delta: '推荐' });
    await waitForRelease(res);
    if (res.writableEnded) return;
    writeFrame(res, { type: 'text-delta', id: 't1', delta: '免费素材' });
    writeFrame(res, { type: 'text-end', id: 't1' });
    writeFrame(res, { type: 'finish', finishReason: 'stop' });
    finishStream(res);
}

async function runHang(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    writeFrame(res, { type: 'text-start', id: 't1' });
    await sleep(50);
    writeFrame(res, { type: 'text-delta', id: 't1', delta: '这段回复尚未完成，' });
    // 永不结束：等停止按钮触发 abort 关闭连接
    await new Promise((resolve) => res.on('close', resolve));
}

async function runReasoning(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    writeFrame(res, { type: 'reasoning-start', id: 'r1' });
    await sleep(30);
    writeFrame(res, {
        type: 'reasoning-delta',
        id: 'r1',
        delta: '用户在要素材，先确认预算与风格。',
    });
    writeFrame(res, { type: 'reasoning-end', id: 'r1' });
    writeFrame(res, { type: 'text-start', id: 't1' });
    await sleep(30);
    writeFrame(res, { type: 'text-delta', id: 't1', delta: '这是结合思考给出的答复。' });
    writeFrame(res, { type: 'text-end', id: 't1' });
    writeFrame(res, { type: 'finish', finishReason: 'stop' });
    finishStream(res);
}

async function runLong(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    writeFrame(res, { type: 'text-start', id: 't1' });
    for (let i = 1; i <= 40; i += 1) {
        await sleep(50);
        writeFrame(res, {
            type: 'text-delta',
            id: 't1',
            delta: `第 ${i} 段：这是一段足够长的推荐文案，用来撑高消息列表制造滚动溢出场景。\n`,
        });
    }
    writeFrame(res, { type: 'text-end', id: 't1' });
    writeFrame(res, { type: 'finish', finishReason: 'stop' });
    finishStream(res);
}

async function runErrorChunk(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    writeFrame(res, { type: 'text-start', id: 't1' });
    await sleep(50);
    writeFrame(res, { type: 'text-delta', id: 't1', delta: '前半段内容' });
    await sleep(50);
    writeFrame(res, { type: 'error', errorText: '上游模型服务错误（HTTP 500）' });
    finishStream(res);
}

async function runDefault(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    writeFrame(res, { type: 'text-start', id: 't1' });
    await sleep(30);
    writeFrame(res, { type: 'text-delta', id: 't1', delta: '你好，我是 AI 导购助手。' });
    writeFrame(res, { type: 'text-end', id: 't1' });
    writeFrame(res, { type: 'finish', finishReason: 'stop' });
    finishStream(res);
}

async function runTool(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    // 闸门 pre：stable 在 thinking（E2E-AI-11 投影序列断言点）
    await waitForRelease(res, 'pre');
    if (res.writableEnded) return;
    writeFrame(res, {
        type: 'tool-input-available',
        toolCallId: 'call-1',
        toolName: 'searchCatalog',
        input: { query: '免费素材', pricingOption: 1 },
    });
    // 闸门 post：stable 在 tool_calling 执行中（E2E-AI-10 工具卡中间态断言点）
    await waitForRelease(res, 'post');
    if (res.writableEnded) return;
    writeFrame(res, {
        type: 'tool-output-available',
        toolCallId: 'call-1',
        output: { items: [{ id: 'p1', title: '免费素材 A' }], total: 1 },
    });
    // tool_result / streaming 观察窗口（E2E-AI-11 轮询步宽，远小于断言超时，确定性可见）
    await sleep(500);
    writeFrame(res, { type: 'text-start', id: 't1' });
    await sleep(300);
    writeFrame(res, { type: 'text-delta', id: 't1', delta: '为你找到 1 个免费素材' });
    writeFrame(res, { type: 'text-end', id: 't1' });
    writeFrame(res, { type: 'finish', finishReason: 'stop' });
    finishStream(res);
}

async function runToolHang(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    writeFrame(res, {
        type: 'tool-input-available',
        toolCallId: 'call-hang',
        toolName: 'searchCatalog',
        input: { query: '挂起场景' },
    });
    // 永不结束：等停止按钮触发 abort 关闭连接
    await new Promise((resolve) => res.on('close', resolve));
}

async function runToolError(res) {
    writeFrame(res, { type: 'start' });
    writeFrame(res, { type: 'start-step' });
    writeFrame(res, {
        type: 'tool-input-available',
        toolCallId: 'call-error',
        toolName: 'searchCatalog',
        input: { query: '失败场景' },
    });
    await sleep(50);
    writeFrame(res, {
        type: 'tool-output-error',
        toolCallId: 'call-error',
        errorText: 'catalog snapshot unavailable',
    });
    writeFrame(res, { type: 'finish', finishReason: 'stop' });
    finishStream(res);
}

function pickScenario(text) {
    if (text.includes('__e2e_gated__')) return runGated;
    if (text.includes('__e2e_hang__')) return runHang;
    if (text.includes('__e2e_reasoning__')) return runReasoning;
    if (text.includes('__e2e_long__')) return runLong;
    if (text.includes('__e2e_error_chunk__')) return runErrorChunk;
    if (text.includes('__e2e_tool_hang__')) return runToolHang;
    if (text.includes('__e2e_tool_error__')) return runToolError;
    if (text.includes('__e2e_tool__')) return runTool;
    return runDefault;
}

/** 从请求体取最后一条 user 消息的 text（对齐 toRequestMessages 的 UIMessage 形状）。 */
function extractUserText(raw) {
    try {
        const body = JSON.parse(raw);
        const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
        const part = lastUser?.parts?.find((p) => p.type === 'text');
        return typeof part?.text === 'string' ? part.text : '';
    } catch {
        return '';
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.startsWith('/__release')) {
        // 命名闸门：?gate=<name> 只放行对应闸门（置位防 release-先于-wait 丢失）；无参 = 放行全部（存量行为）
        const gate = new URL(req.url, 'http://localhost').searchParams.get('gate');
        let releasing;
        if (gate === null) {
            releasing = releaseWaiters;
            releaseWaiters = [];
            releasedGates.add('*');
        } else {
            releasedGates.add(gate);
            releasing = releaseWaiters.filter((w) => w.gate === gate);
            releaseWaiters = releaseWaiters.filter((w) => w.gate !== gate);
        }
        for (const waiter of releasing) waiter.resolve();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`released ${releasing.length}`);
        return;
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
        let raw = '';
        req.on('data', (chunk) => {
            raw += chunk;
        });
        req.on('end', () => {
            releasedGates.clear(); // 新对话请求重置闸门置位
            const scenario = pickScenario(extractUserText(raw));
            sseHead(res);
            scenario(res).catch(() => res.end());
        });
        return;
    }
    res.writeHead(404);
    res.end('not found');
});

server.listen(PORT, () => {
    console.log(`[mock-bff] listening on http://localhost:${PORT}`);
});
