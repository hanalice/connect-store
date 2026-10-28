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
    /** 审批拒绝（execution-denied）时的服务端原因（G3.3：reject 修正链路面）。 */
    deniedReason?: string;
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

/**
 * POST /api/chat 的请求 part 形态（UIMessage part 的最小子集，服务端只校验 type 字符串）。
 * G3.3 裁决④：审批回放 part 形态以 ai@7 类型为准 —— UI 消息的工具 part 经
 * convertToModelMessages 转换：approval-responded part 生成 tool-approval-response
 * （+ deny 时追加 execution-denied 的 tool-result）。
 * edit 分支（G3.3b 起按 ADR D11 方案 B，docs/adr/connect-store-ai-assistant-adr.md）：
 * edit = 修正意图作新用户回合经官方消息流重发（固定标记 [订单修改重发]），由模型重新
 * 发起 placeOrder —— 前端不伪造 toolCall、不发送 input-available part；该变体仅保留为
 * 协议声明面（PM 预拍板「改注释、保变体」，G5.2 落实 Q-D-01）。
 */
export type ChatRequestPart =
    | { type: 'text'; text: string }
    | {
          type: `tool-${string}`;
          toolCallId: string;
          state: 'input-available';
          input: unknown;
      }
    | {
          type: `tool-${string}`;
          toolCallId: string;
          state: 'approval-responded';
          input: unknown;
          approval: ToolApprovalResponseRequest;
      };

/** approval-responded part 的 approval 载荷（镜像 ai@7 approvalRespondedSchema 字段）。 */
export interface ToolApprovalResponseRequest {
    id: string;
    approved: boolean;
    /** deny 原因（reject 反馈，如「太贵了」）；approve 不带。 */
    reason?: string;
    /** 从审批请求帧原样回传（签名/请求原因/isAutomatic/inputSchemaInput 必须回环）。 */
    requestReason?: string;
    isAutomatic?: boolean;
    signature?: string;
    inputSchemaInput?: unknown;
}

/** POST /api/chat 的请求消息形态。 */
export interface ChatRequestMessage {
    role: 'user' | 'assistant';
    parts: ChatRequestPart[];
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

/**
 * 审批 TTL（G3.3）：与 server APPROVAL_TTL_MS = 300_000 同口径（ttl-approval-experiment.md）。
 * ai@7 的 tool-approval-request 帧无 expiresAt 字段 —— 前端按收到帧时刻 + TTL 推导倒计时，
 * 最终以 server 复放判定为准（超时 → denied('approval expired')，API-AI-05）。
 */
export const APPROVAL_TTL_MS = 300_000;

/** placeOrder 审批请求的单条目（input.items 元素，client 展示解析后的形态）。 */
export interface ApprovalItem {
    productId: string;
    quantity: number;
}

/**
 * store 内的审批请求状态（G3.3 裁决④⑤）：tool-approval-request 帧到达时落状态，
 * 卡渲染 / 三按钮回放 / await_human 投影的唯一数据源。
 */
export interface ApprovalRequestState {
    approvalId: string;
    toolCallId: string;
    /** 发起该审批的 assistant 消息 id（回放构造定位目标消息）。 */
    messageId: string;
    /** 从已登记 toolCall 取的 toolName（帧不带 toolName；回放 part 命名 tool-${toolName}）。 */
    toolName: string;
    /** 从已登记 toolCall 取的原始 input（回放必须原样回传，签名按 input 校验）。 */
    rawInput: unknown;
    items: ApprovalItem[];
    /** 服务端 request reason（帧 reason 字段，展示给审批人）。 */
    requestReason?: string;
    /** HMAC 签名（帧 signature 字段，回放必须原样回环，API-AI-06 防伪造）。 */
    signature?: string;
    isAutomatic?: boolean;
    inputSchemaInput?: unknown;
    /** 收到帧时刻（Date.now）：expiresAt = requestedAt + APPROVAL_TTL_MS（帧无 expiresAt）。 */
    requestedAt: number;
    expiresAt: number;
    /** pending=卡可操作；其余为终态投影（approved/rejected/edited/cancelled 由对应 action 置位）。 */
    phase: 'pending' | 'approved' | 'rejected' | 'edited' | 'cancelled';
    /** reject 决策原因（卡展示 + tool-output-denied 落工具卡）。 */
    decisionReason?: string;
}

/** placeOrder input 的客户端最小校验（形状不对不渲染审批卡，防御畸形帧）。 */
export function parsePlaceOrderItems(input: unknown): ApprovalItem[] | null {
    if (typeof input !== 'object' || input === null) return null;
    const items = (input as { items?: unknown }).items;
    if (!Array.isArray(items)) return null;
    const parsed: ApprovalItem[] = [];
    for (const item of items) {
        if (typeof item !== 'object' || item === null) return null;
        const { productId, quantity } = item as { productId?: unknown; quantity?: unknown };
        if (typeof productId !== 'string' || productId.length === 0) return null;
        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
            return null;
        }
        parsed.push({ productId, quantity });
    }
    return parsed.length > 0 ? parsed : null;
}
