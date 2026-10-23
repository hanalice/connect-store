/**
 * 对话状态枚举：对齐 design §5 口径，G1.3 只使用子集。
 * 状态机事实源 = `state/assistantMachine.ts`（G2.2）：9 状态、12 事件与转换表在其中定义导出。
 */
export type AssistantStatus = 'idle' | 'thinking' | 'streaming' | 'error' | 'aborted';

/** 面板内单条消息：reasoning 与正文分开累积，分别交给 ReasoningBlock / StreamingText 渲染。 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    reasoning: string;
}

/** POST /api/chat 的请求消息形态（UIMessage 的最小子集，服务端只校验 role + parts 形状）。 */
export interface ChatRequestMessage {
    role: 'user' | 'assistant';
    parts: { type: 'text'; text: string }[];
}

/** 把面板消息历史转换为请求体消息。 */
export function toRequestMessages(messages: ChatMessage[]): ChatRequestMessage[] {
    return messages.map((message) => ({
        role: message.role,
        parts: [{ type: 'text', text: message.text }],
    }));
}
