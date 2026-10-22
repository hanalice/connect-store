import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';

import { ChatApiError, streamChat } from './chatApi';

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
