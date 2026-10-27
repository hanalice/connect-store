import { create } from 'zustand';
import type { UIMessageChunk } from 'ai';

import { useCartStore } from '../../cart/store/useCartStore';
import { useCatalogStore } from '../../catalog/store/useCatalogStore';
import { buildApprovalReplayMessages, ChatApiError, streamChat } from '../services/chatApi';
import { addToCartOutputSchema } from '../registry/uiRegistry';
import {
    APPROVAL_TTL_MS,
    isAssistantBusy,
    parsePlaceOrderItems,
    toRequestMessages,
    type ApprovalItem,
    type ApprovalRequestState,
    type ChatMessage,
    type ChatRequestMessage,
    type ToolCallInfo,
} from '../types/assistant';
import {
    ASSISTANT_EVENT,
    createAssistantMachine,
    TRANSITIONS,
    type AssistantEvent,
    type AssistantMachine,
    type AssistantState,
    type MachineSendDetail,
} from './assistantMachine';

interface AssistantStore {
    messages: ChatMessage[];
    status: AssistantState;
    error: string | null;
    /** G3.3 审批请求状态（tool-approval-request 帧落状态；null = 无待渲染审批）。 */
    approval: ApprovalRequestState | null;
    /** edit 重新发起后旧卡的失效提示（旧 messageId + 文案；新卡替换旧卡的渲染投影）。 */
    approvalSuperseded: { messageId: string; note: string } | null;
    /** G3.4：error 落态时存原用户消息文本（仅非 pending 路径），供「重试」重发。 */
    lastFailedText: string | null;
    /** G3.4 裁决①：审批 pending 遇流错误时卡内最小提示（保位不回写 error 态）。 */
    approvalNotice: string | null;
    sendMessage: (text: string) => Promise<void>;
    abort: () => void;
    reset: () => void;
    /** 审批三操作 + 取消（G3.3 裁决③④⑤）：均只在 await_human + approval pending 时生效。 */
    approve: () => void;
    reject: (reason: string) => void;
    editOrder: (items: ApprovalItem[]) => void;
    cancelOrder: () => void;
    /** G3.4 裁决②：error 态重试——重发 lastFailedText 原消息（内部走 RETRY + USER_SEND 两事件路径）。 */
    retryLast: () => Promise<void>;
}

let currentController: AbortController | null = null;
/** 一回合一机（裁决①）：machine 实例由模块持有（不可序列化，不进 Zustand state）。 */
let currentMachine: AssistantMachine | null = null;
let messageSeq = 0;

/** 生成面板内消息 id（无持久化需求，递增序号即可）。 */
function nextMessageId(role: ChatMessage['role']): string {
    messageSeq += 1;
    return `${role}-${messageSeq}`;
}

/**
 * 清单条目标题解析（D11 方案 B）：与审批卡同款数据源 —— 目录快照（ChatPanel 解析
 * ApprovalCardItem 的同一份），快照未加载时回退 productId（消息仍含固定标记与数量，
 * prompt 硬约束不依赖标题）。
 */
function resolveItemTitle(productId: string): string {
    return (
        useCatalogStore.getState().products.find((product) => product.id === productId)?.title ??
        productId
    );
}

/**
 * edit 重发用户消息固定格式（D11 方案 B，G3.3b 裁决①；单测锁格式）：
 * `[订单修改重发]` 固定标记 + 人读清单（标题 × 数量，分号分隔，阿拉伯数字）。
 */
function buildEditResendText(items: ApprovalItem[]): string {
    const list = items
        .map((item) => `${resolveItemTitle(item.productId)} × ${item.quantity}`)
        .join('；');
    return `[订单修改重发] 请按以下清单重新下单：${list}。请直接调用 placeOrder 工具提交（会再次经过审批），无需向我确认。`;
}

/** 收尾兜底匹配的机器滞留态：sendMessage 为忙碌三态（报告 §三表缺口）。 */
const BUSY_GAP_STATES = ['thinking', 'tool_calling', 'tool_result'] as const;

/**
 * editOrder 重发回合的收尾兜底滞留态 = 忙碌三态 + await_human：
 * await_human 无 USER_SEND 出边（TRANSITIONS 锁定），查表静默跳过后机器滞留 await_human
 * （新表缺口，登记报告 §三）；模型未重新发起 placeOrder 时收尾须兜 done，防 UI 滞留死锁。
 */
const EDIT_GAP_STATES = [...BUSY_GAP_STATES, 'await_human'] as const;

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * 裁决① 收尾事件纪律：先查表预判 `TRANSITIONS[state][event]` 存在再 send；
 * 非法组合静默跳过（abort 后旧流收尾、表缺口兜底都不得依赖 machine 的 warn 拒绝做控制流）。
 */
function sendMachineEvent(event: AssistantEvent, detail?: MachineSendDetail): boolean {
    const machine = currentMachine;
    if (machine === null) return false;
    if (TRANSITIONS[machine.state][event] === undefined) return false;
    machine.send(event, detail);
    return true;
}

export const useAssistantStore = create<AssistantStore>((set, get) => {
    /** 把流式 delta 累积进指定 assistant 消息（text 与 reasoning 分开；状态只随 machine 事件走）。 */
    const appendDelta = (messageId: string, field: 'text' | 'reasoning', delta: string) => {
        set((state) => ({
            messages: state.messages.map((message) =>
                message.id === messageId
                    ? { ...message, [field]: message[field] + delta }
                    : message,
            ),
        }));
    };

    /** 更新工具卡（渲染数据源，不读 machine 日志）；回放响应补登在发起审批的旧消息上，故全局按 toolCallId 找。 */
    const patchToolCall = (toolCallId: string, patch: Partial<ToolCallInfo>) => {
        set((state) => ({
            messages: state.messages.map((message) =>
                (message.toolCalls ?? []).some((call) => call.toolCallId === toolCallId)
                    ? {
                          ...message,
                          toolCalls: (message.toolCalls ?? []).map((call) =>
                              call.toolCallId === toolCallId ? { ...call, ...patch } : call,
                          ),
                      }
                    : message,
            ),
        }));
    };

    /** 从已登记 toolCall 反查（tool-output-available / tool-approval-request 帧不带 toolName，G3.1 措辞纪律）。 */
    const findToolCall = (toolCallId: string): ToolCallInfo | undefined =>
        get()
            .messages.flatMap((message) => message.toolCalls ?? [])
            .find((call) => call.toolCallId === toolCallId);

    /**
     * 审批回放跑流（G3.3 裁决③④：approve / reject / edit 三按钮的续跑请求）：
     * 新 chat 请求 + 新 assistant 占位消息，onChunk / 收尾 / 错误处理与 sendMessage 同纪律
     * （A4 代际校验 + 查表预判 + 表缺口兜底原样生效）。
     */
    const runApprovalReplay = async (requestMessages: ChatRequestMessage[]) => {
        const assistantMessage: ChatMessage = {
            id: nextMessageId('assistant'),
            role: 'assistant',
            text: '',
            reasoning: '',
            toolCalls: [],
        };
        set((state) => ({ messages: [...state.messages, assistantMessage] }));

        currentController?.abort();
        currentController = new AbortController();
        const { signal } = currentController;
        const isStale = () => signal.aborted || currentController?.signal !== signal;
        const fallbackStatus = get().status;

        try {
            await streamChat({
                messages: requestMessages,
                signal,
                onChunk: (chunk) =>
                    handleChunk(chunk, assistantMessage.id, isStale, fallbackStatus),
            });
            // A4 代际校验（裁决①）：旧代际流正常收尾不得覆盖新状态
            if (currentController !== null && currentController.signal !== signal) {
                return;
            }
            if (sendMachineEvent(ASSISTANT_EVENT.StreamEnd)) {
                set({ status: currentMachine?.state ?? 'done' });
            } else if (
                (currentMachine?.state === 'thinking' ||
                    currentMachine?.state === 'tool_calling' ||
                    currentMachine?.state === 'tool_result') &&
                get().approval?.phase !== 'pending'
            ) {
                // 表缺口兜底：deny 续跑等场景机器滞留忙碌态，回合已成功结束，store 直设 done；
                // 审批 pending 时不顶 await_human（edit 重发后的新审批挂起，裁决⑥表缺口兜底）
                set({ status: 'done' });
            }
            // await_human（edit 重新发起的新审批）/ error / aborted：保持现态，不被收尾顶掉
        } catch (error) {
            if (currentController !== null && currentController.signal !== signal) {
                return;
            }
            // G3.4 裁决①：回放流被取消/出错时新审批 pending（edit 重发挂起）→ 保位 await_human，
            // 卡保留、不回写 error/aborted（决策/取消的续跑是新请求，不依赖已死的流）
            if (get().approval?.phase === 'pending') {
                set({ approvalNotice: '操作失败，可重试' });
                return;
            }
            if (isAbortError(error) || signal.aborted) {
                set({ status: 'aborted', error: null });
                return;
            }
            const message =
                error instanceof ChatApiError ? error.message : '发生未知错误，请稍后重试';
            const sent = sendMachineEvent(ASSISTANT_EVENT.Error);
            const lastUser = [...get().messages].reverse().find((m) => m.role === 'user');
            if (sent) {
                set({
                    status: currentMachine?.state ?? 'error',
                    error: message,
                    lastFailedText: lastUser?.text ?? null,
                });
            } else {
                set({ status: 'error', error: message, lastFailedText: lastUser?.text ?? null });
            }
        } finally {
            if (currentController?.signal === signal) {
                currentController = null;
            }
        }
    };

    /**
     * 官方 UIMessageChunk 消费（ADR D8：直接消费 chunk.type，不自造事件）。
     * sendMessage 与审批回放共用；approval-request 分支落审批状态并投 await_human。
     */
    const handleChunk = (
        chunk: UIMessageChunk,
        assistantMessageId: string,
        isStale: () => boolean,
        fallbackStatus: AssistantState,
    ) => {
        if (chunk.type === 'tool-input-available') {
            if (isStale()) return;
            const startedAt = performance.now();
            sendMachineEvent(ASSISTANT_EVENT.ToolCall, {
                tool: chunk.toolName,
                args: chunk.input,
            });
            set({ status: currentMachine?.state ?? fallbackStatus });
            set((state) => ({
                messages: state.messages.map((message) =>
                    message.id === assistantMessageId
                        ? {
                              ...message,
                              toolCalls: [
                                  ...(message.toolCalls ?? []),
                                  {
                                      toolCallId: chunk.toolCallId,
                                      toolName: chunk.toolName,
                                      input: chunk.input,
                                      startedAt,
                                  },
                              ],
                          }
                        : message,
                ),
            }));
        } else if (chunk.type === 'tool-approval-request') {
            if (isStale()) return;
            // G3.3 裁决④：approval-request 帧 → APPROVAL_REQUEST（streaming→await_human 合法边 :91）+
            // 请求数据落状态供审批卡渲染。toolName / input 从已登记 toolCall 取（帧不带 toolName）；
            // 帧无 expiresAt —— expiresAt 按收帧时刻 + TTL 推导（口径登记报告 §三）。
            const call = findToolCall(chunk.toolCallId);
            if (call === undefined) return; // 未登记的 toolCall 不渲染审批卡（防御畸形帧）
            const items = parsePlaceOrderItems(call.input);
            if (items === null) return; // input 形状不合法（非 placeOrder 语义）不渲染审批卡
            sendMachineEvent(ASSISTANT_EVENT.ApprovalRequest, {
                tool: call.toolName,
                args: call.input,
            });
            const requestedAt = Date.now();
            set({
                // 表缺口兜底（裁决⑥）：edit 重发后 tool_calling + APPROVAL_REQUEST 不在表内，
                // 查表静默跳过后 store 直设 await_human（机器滞留 tool_calling，收尾兜底兜 done）
                status: 'await_human',
                approvalNotice: null, // 新审批到达：清掉上一张卡的流错误提示（G3.4 裁决①）
                approval: {
                    approvalId: chunk.approvalId,
                    toolCallId: chunk.toolCallId,
                    messageId: assistantMessageId,
                    toolName: call.toolName,
                    rawInput: call.input,
                    items,
                    ...(chunk.reason !== undefined ? { requestReason: chunk.reason } : {}),
                    ...(chunk.signature !== undefined ? { signature: chunk.signature } : {}),
                    ...(chunk.isAutomatic !== undefined ? { isAutomatic: chunk.isAutomatic } : {}),
                    ...(chunk.inputSchemaInput !== undefined
                        ? { inputSchemaInput: chunk.inputSchemaInput }
                        : {}),
                    requestedAt,
                    expiresAt: requestedAt + APPROVAL_TTL_MS,
                    phase: 'pending',
                },
            });
        } else if (chunk.type === 'tool-output-available') {
            if (isStale()) return;
            const endedAt = performance.now();
            const call = findToolCall(chunk.toolCallId);
            const durationMs = call === undefined ? 0 : endedAt - call.startedAt;
            sendMachineEvent(ASSISTANT_EVENT.ToolResult, {
                result: chunk.output,
                durationMs,
            });
            set({ status: currentMachine?.state ?? fallbackStatus });
            patchToolCall(chunk.toolCallId, { output: chunk.output, endedAt });
            // G3.1 增量接线（裁决④）：addToCart 成功回执过 zod 校验 → 合并数量写
            // 购物车并自动打开 drawer（裁决⑤ 触发①）；error / 畸形回执校验
            // 失败不写。tool-output-available 帧不带 toolName，从已登记的
            // toolCall 取（chunk 帧协议见 ai SDK UIMessageChunk）。依赖单向：
            // assistant → cart。
            if (call?.toolName === 'addToCart') {
                const receipt = addToCartOutputSchema.safeParse(chunk.output);
                if (receipt.success) {
                    const cart = useCartStore.getState();
                    cart.add(receipt.data.product, receipt.data.quantity);
                    cart.open();
                }
            }
            // G3.3c 裁决② 执行扣减：placeOrder 成功回执触点（tool-output-available = 执行成功
            // 回执帧；error/denied 走各自分支不扣）。数据源 = 客户端被 approve 那张卡的 items
            // （审批记录，按 toolCallId 关联）——placeOrder 输出帧 {orderId, orderNumber, amount}
            // 无 items 字段，不得以输出帧为据；查无审批记录（刷新后回放等无据场景）→ 跳过
            // 扣减，不无据写 cart。不自动开 drawer、无任何 UI 行为变更（裁决③）。
            if (call?.toolName === 'placeOrder') {
                const approval = get().approval;
                if (approval !== null && approval.toolCallId === chunk.toolCallId) {
                    useCartStore.getState().deductExecutedItems(approval.items);
                }
            }
        } else if (chunk.type === 'tool-output-denied') {
            if (isStale()) return;
            const endedAt = performance.now();
            // deny 无对应 machine 事件（事件枚举 12 个内不存在）——只落工具卡终态；
            // 机器停留原态由收尾兜底直设 done（表缺口登记报告 §三）。
            const decisionReason = get().approval?.decisionReason;
            patchToolCall(chunk.toolCallId, {
                ...(decisionReason !== undefined ? { deniedReason: decisionReason } : {}),
                endedAt,
            });
        } else if (chunk.type === 'tool-output-error') {
            if (isStale()) return;
            const endedAt = performance.now();
            const sent = sendMachineEvent(ASSISTANT_EVENT.Error, {
                result: chunk.errorText,
            });
            patchToolCall(chunk.toolCallId, { error: chunk.errorText, endedAt });
            // 有边（tool_calling→error）时同步 machine；缺口态直设（报告 §三）
            set({
                status: sent ? (currentMachine?.state ?? 'error') : 'error',
                error: `工具调用失败：${chunk.errorText}`,
            });
        } else if (chunk.type === 'text-start') {
            if (isStale()) return;
            sendMachineEvent(ASSISTANT_EVENT.StreamStart);
            set({ status: currentMachine?.state ?? fallbackStatus });
        } else if (chunk.type === 'text-delta') {
            appendDelta(assistantMessageId, 'text', chunk.delta);
        } else if (chunk.type === 'reasoning-delta') {
            appendDelta(assistantMessageId, 'reasoning', chunk.delta);
        }
    };

    /**
     * 用户回合发流（sendMessage / editOrder 共用，G3.3b）：abort 旧代际 + A4 代际校验 +
     * 查表收尾 + 表缺口兜底 + G3.4 审批 pending 保位，两条路径同一份实现。
     * gapStates = 收尾兜底匹配的机器滞留态（sendMessage：忙碌三态；editOrder 追加
     * await_human——USER_SEND 查表跳过后机器滞留，见 EDIT_GAP_STATES 注释）。
     */
    const runStreamTurn = async (
        requestMessages: ChatRequestMessage[],
        assistantMessage: ChatMessage,
        fallbackStatus: AssistantState,
        gapStates: readonly AssistantState[],
        failedText: string,
    ): Promise<void> => {
        currentController?.abort();
        currentController = new AbortController();
        const { signal } = currentController;

        /** 代际/取消校验：旧代际流或已取消流的收尾不得触碰 machine 与新状态（A4 裁决①）。 */
        const isStale = () => signal.aborted || currentController?.signal !== signal;

        try {
            await streamChat({
                messages: requestMessages,
                signal,
                onChunk: (chunk) =>
                    handleChunk(chunk, assistantMessage.id, isStale, fallbackStatus),
            });
            // A4 代际校验（裁决①）：旧代际流正常收尾不得覆盖新回合
            if (currentController !== null && currentController.signal !== signal) {
                return;
            }
            if (sendMachineEvent(ASSISTANT_EVENT.StreamEnd)) {
                set({ status: currentMachine?.state ?? 'done' }); // streaming→done
            } else if (
                gapStates.includes(currentMachine?.state ?? 'done') &&
                get().approval?.phase !== 'pending'
            ) {
                // 表缺口兜底（报告 §三）：忙碌态/滞留态无 STREAM_END 边，回合已成功结束，store 直设
                // done；审批 pending 时不顶 await_human（多步回合 tool_calling + APPROVAL_REQUEST
                // 缺口，live 实测：搜索→下单两工具时 machine 滞留 tool_calling，live 2026-10-26 复现修复）
                set({ status: 'done' });
            } else if (get().approval?.phase === 'pending') {
                // 审批挂起（hang but safe 已解除）：STREAM_END 在 await_human 无出边（查表跳过），
                // 停驻 await_human 等用户在审批卡决策；approval-request 分支已落状态
            }
            // error / aborted：保持终态，不被收尾顶掉
        } catch (error) {
            // 竞态防护：aborted 后用户立刻发新消息时，旧请求的收尾不得覆盖新请求的状态
            if (currentController !== null && currentController.signal !== signal) {
                return;
            }
            // G3.4 裁决①：流错误/取消发生在审批 pending 中（多步回合审批挂起后流仍开）→
            // 保位 await_human：不回写 error/aborted、不发 ERROR 事件，审批卡保留（server 侧审批
            // 仍有效，决策/取消的续跑是新请求）；卡内落最小提示「操作失败，可重试」
            if (get().approval?.phase === 'pending') {
                set({ approvalNotice: '操作失败，可重试' });
                return;
            }
            if (isAbortError(error) || signal.aborted) {
                // 主动取消 ≠ 失败：停驻 aborted，不显示重试（design §5 取消语义）
                set({ status: 'aborted', error: null });
                return;
            }
            const message =
                error instanceof ChatApiError ? error.message : '发生未知错误，请稍后重试';
            const sent = sendMachineEvent(ASSISTANT_EVENT.Error);
            if (sent) {
                set({
                    status: currentMachine?.state ?? 'error',
                    error: message,
                    lastFailedText: failedText,
                });
            } else {
                // 表缺口兜底（报告 §三）：thinking / tool_result 无 ERROR 边（如首帧前的网络失败），
                // machine 滞留原态，store 直设 error 保证横幅与输入恢复；machine 续跑见回合开头注释
                set({ status: 'error', error: message, lastFailedText: failedText });
            }
        } finally {
            if (currentController?.signal === signal) {
                currentController = null;
            }
        }
    };

    /** 审批回放目标构造（toolName/input 从审批态原样回传，签名按 input 校验）。 */
    const toReplayTarget = (approval: ApprovalRequestState) => ({
        messageId: approval.messageId,
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        input: approval.rawInput,
        approvalId: approval.approvalId,
        ...(approval.requestReason !== undefined ? { requestReason: approval.requestReason } : {}),
        ...(approval.isAutomatic !== undefined ? { isAutomatic: approval.isAutomatic } : {}),
        ...(approval.signature !== undefined ? { signature: approval.signature } : {}),
        ...(approval.inputSchemaInput !== undefined
            ? { inputSchemaInput: approval.inputSchemaInput }
            : {}),
    });

    return {
        messages: [],
        status: 'idle',
        error: null,
        approval: null,
        approvalSuperseded: null,
        lastFailedText: null,
        approvalNotice: null,

        async sendMessage(text) {
            const trimmed = text.trim();
            const { status, messages } = get();
            // await_human 期间输入由审批卡承接（composer 锁定，ChatPanel 投影），新发送会撞表缺口
            if (!trimmed || isAssistantBusy(status) || status === 'await_human') {
                return;
            }

            // 裁决① 回合边界：done 终态 / 首回合新建机；error 先 RETRY 再 USER_SEND（记两条日志）；
            // aborted 直接 USER_SEND（#20 合法边）。两事件均走查表预判——thinking 等忙碌态无
            // RETRY/USER_SEND 边时静默跳过：上一回合若因表缺口以 store 直设终态收尾（见下文
            // catch / 流收尾注释），machine 滞留忙碌态，而新流的 TOOL_CALL / STREAM_START /
            // USER_ABORT 从忙碌态出发均为合法边，直接续跑即可（缺口已在报告 §三登记，未私改表）。
            if (currentMachine === null || currentMachine.state === 'done') {
                currentMachine = createAssistantMachine();
            }
            if (status === 'error') {
                sendMachineEvent(ASSISTANT_EVENT.Retry);
            }
            sendMachineEvent(ASSISTANT_EVENT.UserSend);

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
                toolCalls: [],
            };
            const nextMessages = [...messages, userMessage, assistantMessage];

            // USER_SEND 的合法落点恒为 thinking；被表跳过（缺口兜底）时直设 thinking 保证 UI 不死锁
            set({ messages: nextMessages, status: 'thinking', error: null, lastFailedText: null });

            await runStreamTurn(
                toRequestMessages([...messages, userMessage]),
                assistantMessage,
                status,
                BUSY_GAP_STATES,
                trimmed,
            );
        },

        approve() {
            const { status, approval, messages } = get();
            if (status !== 'await_human' || approval?.phase !== 'pending') return;
            // 查表预判（裁决①）：await_human + APPROVE → tool_calling（:97 合法边）。edit 重发后
            // machine 滞留 tool_calling（表缺口，store 兜底 await_human）——事件查表跳过但 action 继续，
            // 回放帧从 tool_calling 合法出边（TOOL_RESULT），machine 随之恢复
            sendMachineEvent(ASSISTANT_EVENT.Approve, { tool: approval.toolName });
            set({
                approval: { ...approval, phase: 'approved' },
                approvalNotice: null, // G3.4 裁决①：用户已重新决策，清掉流错误提示
                status: currentMachine?.state ?? 'tool_calling',
            });
            // 回放：历史 + assistant 消息含 tool-approval-response part（approved:true，裁决④）
            const requestMessages = buildApprovalReplayMessages(
                messages,
                toReplayTarget(approval),
                {
                    approved: true,
                },
            );
            void runApprovalReplay(requestMessages);
        },

        reject(reason) {
            const trimmed = reason.trim();
            const { status, approval, messages } = get();
            if (trimmed.length === 0) return;
            if (status !== 'await_human' || approval?.phase !== 'pending') return;
            // 查表预判（裁决①）：await_human + REJECT → thinking（:98 合法边）；edit 重发后的
            // machine 滞留缺口同 approve——事件查表跳过但 action 继续，收尾兜底直设 done
            sendMachineEvent(ASSISTANT_EVENT.Reject, { result: trimmed });
            set({
                approval: { ...approval, phase: 'rejected', decisionReason: trimmed },
                approvalNotice: null,
                status: currentMachine?.state ?? 'thinking',
            });
            // 回放：approval-response part 带 reason（ai@7 part 支持 reason，类型核对结论，裁决④）
            const requestMessages = buildApprovalReplayMessages(
                messages,
                toReplayTarget(approval),
                {
                    approved: false,
                    reason: trimmed,
                },
            );
            void runApprovalReplay(requestMessages);
        },

        editOrder(items) {
            const { status, approval, messages } = get();
            if (status !== 'await_human' || approval?.phase !== 'pending') return;
            if (items.length === 0) return;
            // D11 方案 B（G3.3b）：edit = 修正意图作新用户回合进官方消息流，由模型重新发起
            // placeOrder → SDK 原生 toolApproval 二次挂起新审批卡。不再伪造 toolCall part
            // （ai@7 本地校验历史 toolCall 必带 result，伪造即 MissingToolResultsError，edit live
            // 100% 必现的根因，ADR D11）；四护栏：prompt 硬约束（chat-prompt.ts）+ zod input
            // schema + 二次审批卡人工复核 + G3.4 error 兜底（本函数收尾走 runStreamTurn 同款）。
            // machine 语义：await_human 无 USER_SEND 出边（TRANSITIONS 锁定）——查表静默跳过 +
            // store 直设 thinking（sendMessage 既有兜底手法，新表缺口登记报告 §三）；EDIT 事件
            // 不再发送（edit 不再是机器语义边的行使，D11 后 approve/reject 回放路径不受影响）。
            const editText = buildEditResendText(items);
            const userMessage: ChatMessage = {
                id: nextMessageId('user'),
                role: 'user',
                text: editText,
                reasoning: '',
            };
            const assistantMessage: ChatMessage = {
                id: nextMessageId('assistant'),
                role: 'assistant',
                text: '',
                reasoning: '',
                toolCalls: [],
            };
            // 消息历史截断不变式（防 MissingToolResultsError 复发，G3.3b 裁决①）：
            // 请求体 = 当前历史剔除含未应答审批的 assistant 消息（approval.messageId）+
            // edit 用户消息；本地面板保留旧消息（approvalSuperseded 投影锚定旧 messageId）。
            const requestMessages: ChatRequestMessage[] = [
                ...toRequestMessages(
                    messages.filter((message) => message.id !== approval.messageId),
                ),
                { role: 'user', parts: [{ type: 'text', text: editText }] },
            ];

            sendMachineEvent(ASSISTANT_EVENT.UserSend); // await_human 无出边：查表静默跳过（缺口登记 §三）

            // USER_SEND 被表跳过后 store 直设 thinking（sendMessage 同款兜底，保证 UI 不死锁）
            set({
                messages: [...messages, userMessage, assistantMessage],
                status: 'thinking',
                approval: { ...approval, phase: 'edited' },
                approvalSuperseded: { messageId: approval.messageId, note: '已修改并重新发起' },
                approvalNotice: null,
                error: null,
                lastFailedText: null,
            });

            // G3.3c 裁决① edit 同步（与 superseded 投影同处 = editOrder 确认点；PM 修订窄读）：
            // cart 按修改后 draft items 对齐，作用域 = 被 edit 那张卡的原订单 items（approval.items）
            // ——draft 含 → 数量直写对齐；原订单含而 draft 不含（edit 移除）→ 删行；订单外 cart 行
            // （含 await_human 期间手动加购）一律保留，align 永不新增（Q-D-01 回归锁）。
            // 依赖单向 assistant → cart，订单链路不越界代写。
            useCartStore.getState().alignWithOrderItems(approval.items, items);

            void runStreamTurn(
                requestMessages,
                assistantMessage,
                'await_human',
                EDIT_GAP_STATES,
                editText,
            );
        },

        cancelOrder() {
            // 取消订单（裁决⑤）：停驻 aborted、不执行订单；审批卡转 cancelled 由 abort 投影
            get().abort();
        },

        abort() {
            const { status, approval } = get();
            // 裁决⑤：abort 只增不改纳入 await_human（await_human + USER_ABORT → aborted，:100 合法边）
            if (!isAssistantBusy(status) && status !== 'await_human') {
                return;
            }
            currentController?.abort();
            // 立即停驻 aborted，不等流抛出，停止按钮反馈即时
            sendMachineEvent(ASSISTANT_EVENT.UserAbort);
            if (approval?.phase === 'pending') {
                set({
                    approval: { ...approval, phase: 'cancelled' },
                    approvalNotice: null,
                    status: 'aborted',
                    error: null,
                });
            } else {
                set({ status: 'aborted', error: null, approvalNotice: null });
            }
        },

        async retryLast() {
            const { status, lastFailedText } = get();
            // G3.4 裁决②：仅 error 态可重试（aborted 无重试语义，design §5 三约束①）；
            // 内部复用既有「error 先 RETRY 再 USER_SEND」两事件路径（G2.3 裁决①），不新造机器事件
            if (status !== 'error' || lastFailedText === null) return;
            await get().sendMessage(lastFailedText);
        },

        reset() {
            currentController?.abort();
            currentController = null;
            currentMachine = null;
            set({
                messages: [],
                status: 'idle',
                error: null,
                approval: null,
                approvalSuperseded: null,
                lastFailedText: null,
                approvalNotice: null,
            });
        },
    };
});
