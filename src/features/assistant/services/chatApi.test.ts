import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';

import {
    buildApprovalReplayMessages,
    buildEditReplayMessages,
    ChatApiError,
    streamChat,
} from './chatApi';

/** 构造一条受控 SSE 流：每个元素是一帧 JSON（UIMessageChunk），供确定性测试（design §9）。 */
function sseStream(frames: unknown[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const frame of frames) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
            }
            controller.close();
        },
    });
}

function okResponse(body: ReadableStream<Uint8Array>): Response {
    return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
    });
}

const REQUEST_MESSAGES = [
    { role: 'user' as const, parts: [{ type: 'text' as const, text: 'hi' }] },
];

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('streamChat', () => {
    it('按序消费官方 UIMessageChunk（text-delta 原文透传）', async () => {
        const frames = [
            { type: 'start' },
            { type: 'start-step' },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: '推荐' },
            { type: 'text-delta', id: 't1', delta: '免费素材' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: 'stop' },
        ];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(sseStream(frames))));

        const chunks: UIMessageChunk[] = [];
        await streamChat({
            messages: REQUEST_MESSAGES,
            signal: new AbortController().signal,
            onChunk: (chunk) => chunks.push(chunk),
        });

        expect(chunks.map((chunk) => chunk.type)).toEqual([
            'start',
            'start-step',
            'text-start',
            'text-delta',
            'text-delta',
            'text-end',
            'finish',
        ]);
        const deltas = chunks.filter((chunk) => chunk.type === 'text-delta');
        expect(deltas.map((chunk) => chunk.delta).join('')).toBe('推荐免费素材');
    });

    it('非 2xx：读取 JSON 错误体，抛 ChatApiError(kind=http)', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response(JSON.stringify({ error: 'LLM not configured' }), { status: 503 }),
                ),
        );

        const error = await streamChat({
            messages: REQUEST_MESSAGES,
            signal: new AbortController().signal,
            onChunk: () => {},
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ChatApiError);
        expect((error as ChatApiError).kind).toBe('http');
        expect((error as ChatApiError).status).toBe(503);
        expect((error as ChatApiError).message).toContain('LLM not configured');
    });

    it('网络失败（fetch 抛 TypeError）：抛 ChatApiError(kind=network)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

        const error = await streamChat({
            messages: REQUEST_MESSAGES,
            signal: new AbortController().signal,
            onChunk: () => {},
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ChatApiError);
        expect((error as ChatApiError).kind).toBe('network');
    });

    it('流中途断开：抛 ChatApiError(kind=stream)', async () => {
        const encoder = new TextEncoder();
        const brokenStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`),
                );
                controller.error(new TypeError('network socket disconnected'));
            },
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(brokenStream)));

        const error = await streamChat({
            messages: REQUEST_MESSAGES,
            signal: new AbortController().signal,
            onChunk: () => {},
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ChatApiError);
        expect((error as ChatApiError).kind).toBe('stream');
        expect((error as ChatApiError).message).toContain('连接中断');
    });

    it('流中出现 error chunk：抛 ChatApiError(kind=stream) 并带上游文案', async () => {
        const frames = [{ type: 'error', errorText: '上游模型服务错误（HTTP 500）' }];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(sseStream(frames))));

        const error = await streamChat({
            messages: REQUEST_MESSAGES,
            signal: new AbortController().signal,
            onChunk: () => {},
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ChatApiError);
        expect((error as ChatApiError).kind).toBe('stream');
        expect((error as ChatApiError).message).toBe('上游模型服务错误（HTTP 500）');
    });

    it('用户主动停止：抛 AbortError（不报 ChatApiError，取消语义 ≠ 失败语义）', async () => {
        // 永不结束的流：第一帧之后挂起，等 abort 后被 cancel
        const hangingStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`),
                );
            },
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(hangingStream)));

        const controller = new AbortController();
        const pending = streamChat({
            messages: REQUEST_MESSAGES,
            signal: controller.signal,
            onChunk: () => {},
        });
        controller.abort();

        const error = await pending.catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).name).toBe('AbortError');
    });
});

describe('审批回放构造器（G3.3 裁决④：纯函数，part 形态以 ai@7 类型为准）', () => {
    const history = [
        { id: 'user-1', role: 'user' as const, text: '帮我下单', reasoning: '' },
        {
            id: 'assistant-2',
            role: 'assistant' as const,
            text: '正在等待确认',
            reasoning: '',
            toolCalls: [
                {
                    toolCallId: 'call-1',
                    toolName: 'placeOrder',
                    input: { items: [{ productId: 'p1', quantity: 2 }] },
                    startedAt: 0,
                },
            ],
        },
    ];
    const target = {
        messageId: 'assistant-2',
        toolCallId: 'call-1',
        toolName: 'placeOrder',
        input: { items: [{ productId: 'p1', quantity: 2 }] },
        approvalId: 'appr-1',
        requestReason: 'placeOrder requires approval',
        signature: 'sig-abc',
    };

    it('approve 回放：目标 assistant 消息含 approval-responded part（approved + 签名回环）', () => {
        const messages = buildApprovalReplayMessages(history, target, { approved: true });

        expect(messages).toHaveLength(2);
        expect(messages[0]).toEqual({
            role: 'user',
            parts: [{ type: 'text', text: '帮我下单' }],
        });
        expect(messages[1].parts).toEqual([
            { type: 'text', text: '正在等待确认' },
            {
                type: 'tool-placeOrder',
                toolCallId: 'call-1',
                state: 'approval-responded',
                input: { items: [{ productId: 'p1', quantity: 2 }] },
                approval: {
                    id: 'appr-1',
                    approved: true,
                    requestReason: 'placeOrder requires approval',
                    signature: 'sig-abc',
                },
            },
        ]);
    });

    it('reject 回放：part 携带 reason（太贵了）；inputSchemaInput 未携带时不补键', () => {
        const messages = buildApprovalReplayMessages(history, target, {
            approved: false,
            reason: '太贵了',
        });

        const part = messages[1].parts[1];
        expect(part).toMatchObject({
            type: 'tool-placeOrder',
            state: 'approval-responded',
            approval: { id: 'appr-1', approved: false, reason: '太贵了', signature: 'sig-abc' },
        });
        expect(
            part.type === 'tool-placeOrder' && 'approval' in part ? Object.keys(part.approval) : [],
        ).not.toContain('inputSchemaInput');
    });

    it('edit 重发回放（裁决③）：不发审批响应 —— 新 toolCall part（新 toolCallId + 修改后 items）', () => {
        const messages = buildEditReplayMessages(history, {
            messageId: 'assistant-2',
            toolCallId: 'call-edit-1',
            toolName: 'placeOrder',
            input: { items: [{ productId: 'p1', quantity: 1 }] },
        });

        expect(messages[1].parts).toEqual([
            { type: 'text', text: '正在等待确认' },
            {
                type: 'tool-placeOrder',
                toolCallId: 'call-edit-1',
                state: 'input-available',
                input: { items: [{ productId: 'p1', quantity: 1 }] },
            },
        ]);
    });
});
