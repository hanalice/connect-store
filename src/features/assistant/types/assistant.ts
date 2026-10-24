/**
 * 对话消息与工具调用类型。状态事实源 = `state/assistantMachine.ts`（G2.3 裁决②：删除旧的
 * 5 态 AssistantStatus 投影，全仓统一从状态机导入 9 态 AssistantState）。
 */

import type { AssistantState } from '../state/assistantMachine';

/** 面板内单条工具调用（渲染数据源挂在消息上，不读 machine 日志）。 */
export interface ToolCallInfo {
    toolCallId: string;
    toolName: string;
    input: unknown;
    output?: unknown;
    error?: string;
    startedAt: number; // performance.now()
    endedAt?: number; // 未结束 = 执行中，不显示耗时
}

/** 面板内单条消息：reasoning 与正文分开累积，分别交给 ReasoningBlock / StreamingText 渲染。 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    reasoning: string;
    toolCalls?: ToolCallInfo[];
}

/** POST /api/chat 的请求消息形态（UIMessage 的最小子集，服务端只校验 role + parts 形状）。 */
export interface ChatRequestMessage {
    role: 'user' | 'assistant';
    parts: { type: 'text'; text: string }[];
}

/** UI 忙碌口径（裁决②）：停止按钮在这四态可用，对应 USER_ABORT 四条边。 */
export function isAssistantBusy(status: AssistantState): boolean {
    return (
        status === 'thinking' ||
        status === 'streaming' ||
        status === 'tool_calling' ||
        status === 'tool_result'
    );
}

/** 把面板消息历史转换为请求体消息。 */
export function toRequestMessages(messages: ChatMessage[]): ChatRequestMessage[] {
    return messages.map((message) => ({
        role: message.role,
        parts: [{ type: 'text', text: message.text }],
    }));
}
