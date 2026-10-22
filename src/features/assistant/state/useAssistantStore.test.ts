import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';

import { ChatApiError } from '../services/chatApi';
import { useAssistantStore } from './useAssistantStore';

// mock 传输层：用受控 chunk 序列驱动 store，保证测试确定性（LLM 是不确定依赖）
vi.mock('../services/chatApi', async (importOriginal) => {
    const original = await importOriginal<typeof import('../services/chatApi')>();
    return { ...original, streamChat: vi.fn() };
});

import { streamChat } from '../services/chatApi';

const mockStreamChat = vi.mocked(streamChat);

type StreamChatOptions = Parameters<typeof streamChat>[0];

/** 让 mock 的 streamChat 按序吐出 chunks 后正常结束。 */
function streamChunks(chunks: UIMessageChunk[]) {
    mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
        for (const chunk of chunks) {
            onChunk(chunk);
        }
    });
}

describe('useAssistantStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAssistantStore.getState().reset();
    });

    it('发送消息：user/assistant 消息入列，text-delta 与 reasoning-delta 分开累积', async () => {
        streamChunks([
            { type: 'start' },
            { type: 'reasoning-start', id: 'r1' },
            { type: 'reasoning-delta', id: 'r1', delta: '用户在找' },
            { type: 'reasoning-delta', id: 'r1', delta: '免费素材' },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: '推荐这些' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);

        await useAssistantStore.getState().sendMessage('推荐免费的素材');

        const { messages, status } = useAssistantStore.getState();
        expect(status).toBe('idle');
        expect(messages).toHaveLength(2);
        expect(messages[0]).toMatchObject({ role: 'user', text: '推荐免费的素材' });
        expect(messages[1]).toMatchObject({
            role: 'assistant',
            text: '推荐这些',
            reasoning: '用户在找免费素材',
        });
        // 请求体只包含 user 消息（assistant 占位消息不应发出去）
        const sentMessages = mockStreamChat.mock.calls[0][0].messages;
        expect(sentMessages).toEqual([
            { role: 'user', parts: [{ type: 'text', text: '推荐免费的素材' }] },
        ]);
    });

    it('点停止：abort 触发、状态停驻 aborted、保留已收到的部分内容（INT-AI-02）', async () => {
        mockStreamChat.mockImplementation(
            ({ signal, onChunk }: StreamChatOptions) =>
                new Promise<void>((_resolve, reject) => {
                    onChunk({ type: 'text-delta', id: 't1', delta: '前半段' } as UIMessageChunk);
                    signal.addEventListener('abort', () => {
                        reject(new DOMException('Aborted', 'AbortError'));
                    });
                }),
        );

        const sending = useAssistantStore.getState().sendMessage('讲个长答案');
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('streaming');
        });

        useAssistantStore.getState().abort();
        await sending;

        const { messages, status, error } = useAssistantStore.getState();
        expect(status).toBe('aborted');
        expect(error).toBeNull();
        expect(messages[1]?.text).toBe('前半段');
    });

    it('传输层失败：状态 error 且带明确文案，不清空消息', async () => {
        mockStreamChat.mockRejectedValue(
            new ChatApiError('network', '无法连接服务器，请检查网络后重试'),
        );

        await useAssistantStore.getState().sendMessage('测试错误');

        const { messages, status, error } = useAssistantStore.getState();
        expect(status).toBe('error');
        expect(error).toContain('无法连接服务器');
        expect(messages).toHaveLength(2);
    });

    it('aborted 后继续发消息：进入 thinking，无自动重发（design §5 出边约束）', async () => {
        mockStreamChat.mockImplementation(
            ({ signal }: StreamChatOptions) =>
                new Promise<void>((_resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        reject(new DOMException('Aborted', 'AbortError'));
                    });
                }),
        );
        const first = useAssistantStore.getState().sendMessage('第一条');
        useAssistantStore.getState().abort();
        await first;
        expect(useAssistantStore.getState().status).toBe('aborted');

        streamChunks([{ type: 'text-delta', id: 't2', delta: '新回复' } as UIMessageChunk]);
        await useAssistantStore.getState().sendMessage('第二条');

        const { messages, status } = useAssistantStore.getState();
        expect(status).toBe('idle');
        expect(messages).toHaveLength(4);
        expect(messages[3]?.text).toBe('新回复');
    });

    it('streaming/thinking 中重复发送被忽略', async () => {
        mockStreamChat.mockImplementation(
            () => new Promise<void>(() => {}), // 永不结束
        );

        void useAssistantStore.getState().sendMessage('第一条');
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('thinking');
        });
        await useAssistantStore.getState().sendMessage('第二条');

        expect(mockStreamChat).toHaveBeenCalledTimes(1);
        expect(useAssistantStore.getState().messages).toHaveLength(2);
        useAssistantStore.getState().reset();
    });
});
