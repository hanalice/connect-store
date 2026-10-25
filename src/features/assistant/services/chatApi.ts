import { parseJsonEventStream, uiMessageChunkSchema, type UIMessageChunk } from 'ai';

import type { ChatMessage, ChatRequestMessage, ChatRequestPart } from '../types/assistant';

/** 传输层错误分类：网络失败 / 非 2xx / 流中途异常，供 UI 区分文案。 */
export type ChatApiErrorKind = 'network' | 'http' | 'stream';

/** 传输层错误：携带 kind 与可选 HTTP 状态码；主动取消不走本类型（对齐 AbortError 语义）。 */
export class ChatApiError extends Error {
    readonly kind: ChatApiErrorKind;
    readonly status?: number;

    constructor(kind: ChatApiErrorKind, message: string, status?: number) {
        super(message);
        this.name = 'ChatApiError';
        this.kind = kind;
        this.status = status;
    }
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * 审批回放的目标 toolCall 上下文（G3.3 裁决④）：toolName / input 从已登记 toolCall 取
 * （tool-approval-request 帧不带 toolName；签名按 toolName + toolCallId + input 校验，
 * 回放必须原样回传）。approval 元数据从请求帧原样回环（signature 缺失会被 SDK 拒，API-AI-06）。
 */
export interface ApprovalReplayTarget {
    messageId: string;
    toolCallId: string;
    toolName: string;
    input: unknown;
    approvalId: string;
    requestReason?: string;
    isAutomatic?: boolean;
    signature?: string;
    inputSchemaInput?: unknown;
}

/**
 * 用回放 part 替换目标 assistant 消息的 parts（纯函数：消息历史 + approval-response part，
 * G3.3 裁决④）。目标消息按面板 id 定位（请求体无 id 字段，按下标对齐）。
 */
export function buildApprovalReplayMessages(
    messages: ChatMessage[],
    target: ApprovalReplayTarget,
    decision: { approved: boolean; reason?: string },
): ChatRequestMessage[] {
    const requestMessages: ChatRequestMessage[] = messages.map((message) => ({
        role: message.role,
        parts: [{ type: 'text' as const, text: message.text }],
    }));
    const replayMessage = requestMessages[getMessageIndex(messages, target.messageId)];
    const approvalPart: ChatRequestPart = {
        type: `tool-${target.toolName}`,
        toolCallId: target.toolCallId,
        state: 'approval-responded' as const,
        input: target.input,
        approval: {
            id: target.approvalId,
            approved: decision.approved,
            ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
            ...(target.requestReason !== undefined ? { requestReason: target.requestReason } : {}),
            ...(target.isAutomatic !== undefined ? { isAutomatic: target.isAutomatic } : {}),
            ...(target.signature !== undefined ? { signature: target.signature } : {}),
            // inputSchemaInput 仅在原帧携带时回环（SDK 按 hasOwnProperty 判分支，补 undefined 会误走校验）
            ...(target.inputSchemaInput !== undefined
                ? { inputSchemaInput: target.inputSchemaInput }
                : {}),
        },
    };
    if (replayMessage !== undefined && replayMessage.role === 'assistant') {
        replayMessage.parts = [
            ...replayMessage.parts.filter((part) => part.type === 'text' && part.text !== ''),
            approvalPart,
        ];
    }
    return requestMessages;
}

/**
 * edit 重新发起回放（G3.3 裁决③）：不发审批响应 —— 目标 assistant 消息追加新 tool-call part
 * （新 toolCallId + 修改后 input，state=input-available 的纯 tool-call part）。
 */
export function buildEditReplayMessages(
    messages: ChatMessage[],
    target: {
        messageId: string;
        toolCallId: string;
        toolName: string;
        input: unknown;
    },
): ChatRequestMessage[] {
    const requestMessages: ChatRequestMessage[] = messages.map((message) => ({
        role: message.role,
        parts: [{ type: 'text' as const, text: message.text }],
    }));
    const replayMessage = requestMessages[getMessageIndex(messages, target.messageId)];
    if (replayMessage !== undefined && replayMessage.role === 'assistant') {
        replayMessage.parts = [
            ...replayMessage.parts.filter((part) => part.type === 'text' && part.text !== ''),
            {
                type: `tool-${target.toolName}`,
                toolCallId: target.toolCallId,
                state: 'input-available' as const,
                input: target.input,
            },
        ];
    }
    return requestMessages;
}

/** 面板消息 id → 请求体下标（请求体无 id 字段，按下标对齐）。 */
function getMessageIndex(messages: ChatMessage[], messageId: string): number {
    return messages.findIndex((message) => message.id === messageId);
}

export interface StreamChatOptions {
    messages: ChatRequestMessage[];
    signal: AbortSignal;
    onChunk: (chunk: UIMessageChunk) => void;
}

/**
 * 自研传输层（ADR D8 路线 C）：POST /api/chat，消费官方 UI 消息流（UIMessageChunk）。
 * SSE 帧解析与 chunk 校验复用官方 parseJsonEventStream + uiMessageChunkSchema，不自造事件格式。
 */
export async function streamChat({ messages, signal, onChunk }: StreamChatOptions): Promise<void> {
    let response: Response;
    try {
        response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages }),
            signal,
        });
    } catch (error) {
        if (isAbortError(error)) throw error;
        // fetch 仅在网络层失败（DNS / 连接拒绝 / 断网）时抛 TypeError
        throw new ChatApiError('network', '无法连接服务器，请检查网络后重试');
    }

    if (!response.ok) {
        // 服务端错误体为 { error: string }（见 server/chat.ts）；错误体不是 JSON 时忽略详情
        let detail = '';
        try {
            const data: unknown = await response.json();
            if (
                typeof data === 'object' &&
                data !== null &&
                'error' in data &&
                typeof data.error === 'string'
            ) {
                detail = data.error;
            }
        } catch {
            detail = '';
        }
        throw new ChatApiError(
            'http',
            `请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`,
            response.status,
        );
    }

    if (!response.body) {
        throw new ChatApiError('stream', '响应没有消息体');
    }

    const chunkStream = parseJsonEventStream<UIMessageChunk>({
        stream: response.body,
        schema: uiMessageChunkSchema,
    });
    const reader = chunkStream.getReader();

    // 流读取不会自动跟随 fetch 的 signal：挂 abort 监听主动 cancel，保证停止按钮即时生效
    const handleAbort = () => {
        void reader.cancel();
    };
    signal.addEventListener('abort', handleAbort);

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            if (!value.success) {
                throw new ChatApiError('stream', '消息流解析失败');
            }
            const chunk = value.value;
            if (chunk.type === 'error') {
                throw new ChatApiError('stream', chunk.errorText || '模型服务返回错误');
            }
            onChunk(chunk);
        }
        // 用户在最后一帧后、循环退出前点停止：仍按取消语义处理，不报成功
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    } catch (error) {
        if (isAbortError(error) || signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        if (error instanceof ChatApiError) throw error;
        // 流读到一半连接被切断（停 BFF / 断网），reader.read() 抛 TypeError
        throw new ChatApiError('stream', '连接中断，回复未完整接收');
    } finally {
        signal.removeEventListener('abort', handleAbort);
        reader.releaseLock();
    }
}
