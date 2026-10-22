import { create } from 'zustand';

import { ChatApiError, streamChat } from '../services/chatApi';
import { toRequestMessages, type AssistantStatus, type ChatMessage } from '../types/assistant';

interface AssistantStore {
    messages: ChatMessage[];
    status: AssistantStatus;
    error: string | null;
    sendMessage: (text: string) => Promise<void>;
    abort: () => void;
    reset: () => void;
}

let currentController: AbortController | null = null;
let messageSeq = 0;

/** 生成面板内消息 id（无持久化需求，递增序号即可）。 */
function nextMessageId(role: ChatMessage['role']): string {
    messageSeq += 1;
    return `${role}-${messageSeq}`;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

export const useAssistantStore = create<AssistantStore>((set, get) => ({
    messages: [],
    status: 'idle',
    error: null,

    async sendMessage(text) {
        const trimmed = text.trim();
        const { status, messages } = get();
        if (!trimmed || status === 'thinking' || status === 'streaming') {
            return;
        }

        const userMessage: ChatMessage = {
            id: nextMessageId('user'),
            role: 'user',
            text: trimmed,
            reasoning: '',
        };
        const assistantMessage: ChatMessage = {
            id: nextMessageId('assistant'),
            role: 'assistant',
            text: '',
            reasoning: '',
        };
        const nextMessages = [...messages, userMessage, assistantMessage];

        currentController?.abort();
        currentController = new AbortController();
        const { signal } = currentController;

        set({ messages: nextMessages, status: 'thinking', error: null });

        /** 把流式 delta 累积进当前 assistant 消息（text 与 reasoning 分开）。 */
        const appendDelta = (field: 'text' | 'reasoning', delta: string) => {
            set((state) => ({
                status: 'streaming',
                messages: state.messages.map((message) =>
                    message.id === assistantMessage.id
                        ? { ...message, [field]: message[field] + delta }
                        : message,
                ),
            }));
        };

        try {
            await streamChat({
                messages: toRequestMessages([...messages, userMessage]),
                signal,
                onChunk: (chunk) => {
                    // 直接消费官方 UIMessageChunk 的 type，不自造事件（ADR D8）
                    if (chunk.type === 'text-delta') {
                        appendDelta('text', chunk.delta);
                    } else if (chunk.type === 'reasoning-delta') {
                        appendDelta('reasoning', chunk.delta);
                    }
                },
            });
            // G1.3 尚无 done 态（G2.2 引入转换表），流正常结束后回到 idle 等待下一条消息
            set({ status: 'idle' });
        } catch (error) {
            // 竞态防护：aborted 后用户立刻发新消息时，旧请求的收尾不得覆盖新请求的状态
            if (currentController !== null && currentController.signal !== signal) {
                return;
            }
            if (isAbortError(error) || signal.aborted) {
                // 主动取消 ≠ 失败：停驻 aborted，不显示重试（design §5 取消语义）
                set({ status: 'aborted', error: null });
                return;
            }
            const message =
                error instanceof ChatApiError ? error.message : '发生未知错误，请稍后重试';
            set({ status: 'error', error: message });
        } finally {
            if (currentController?.signal === signal) {
                currentController = null;
            }
        }
    },

    abort() {
        const { status } = get();
        if (status !== 'thinking' && status !== 'streaming') {
            return;
        }
        currentController?.abort();
        // 立即停驻 aborted，不等流抛出，停止按钮反馈即时
        set({ status: 'aborted', error: null });
    },

    reset() {
        currentController?.abort();
        currentController = null;
        set({ messages: [], status: 'idle', error: null });
    },
}));
