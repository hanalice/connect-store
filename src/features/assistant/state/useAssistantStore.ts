import { create } from 'zustand';

import { ChatApiError, streamChat } from '../services/chatApi';
import {
    isAssistantBusy,
    toRequestMessages,
    type ChatMessage,
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
    sendMessage: (text: string) => Promise<void>;
    abort: () => void;
    reset: () => void;
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

export const useAssistantStore = create<AssistantStore>((set, get) => ({
    messages: [],
    status: 'idle',
    error: null,

    async sendMessage(text) {
        const trimmed = text.trim();
        const { status, messages } = get();
        if (!trimmed || isAssistantBusy(status)) {
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

        currentController?.abort();
        currentController = new AbortController();
        const { signal } = currentController;

        // USER_SEND 的合法落点恒为 thinking；被表跳过（缺口兜底）时直设 thinking 保证 UI 不死锁
        set({ messages: nextMessages, status: 'thinking', error: null });

        /** 把流式 delta 累积进当前 assistant 消息（text 与 reasoning 分开；状态只随 machine 事件走）。 */
        const appendDelta = (field: 'text' | 'reasoning', delta: string) => {
            set((state) => ({
                messages: state.messages.map((message) =>
                    message.id === assistantMessage.id
                        ? { ...message, [field]: message[field] + delta }
                        : message,
                ),
            }));
        };

        /** 更新当前 assistant 消息上的工具卡（渲染数据源，不读 machine 日志）。 */
        const patchToolCall = (toolCallId: string, patch: Partial<ToolCallInfo>) => {
            set((state) => ({
                messages: state.messages.map((message) =>
                    message.id === assistantMessage.id
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

        /** 代际/取消校验：旧代际流或已取消流的收尾不得触碰 machine 与新状态（A4 裁决①）。 */
        const isStale = () => signal.aborted || currentController?.signal !== signal;

        try {
            await streamChat({
                messages: toRequestMessages([...messages, userMessage]),
                signal,
                onChunk: (chunk) => {
                    // 直接消费官方 UIMessageChunk 的 type，不自造事件（ADR D8）
                    if (chunk.type === 'tool-input-available') {
                        if (isStale()) return;
                        const startedAt = performance.now();
                        sendMachineEvent(ASSISTANT_EVENT.ToolCall, {
                            tool: chunk.toolName,
                            args: chunk.input,
                        });
                        set({ status: currentMachine?.state ?? status });
                        set((state) => ({
                            messages: state.messages.map((message) =>
                                message.id === assistantMessage.id
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
                    } else if (chunk.type === 'tool-output-available') {
                        if (isStale()) return;
                        const endedAt = performance.now();
                        const call = (
                            useAssistantStore
                                .getState()
                                .messages.find((message) => message.id === assistantMessage.id)
                                ?.toolCalls ?? []
                        ).find((item) => item.toolCallId === chunk.toolCallId);
                        const durationMs = call === undefined ? 0 : endedAt - call.startedAt;
                        sendMachineEvent(ASSISTANT_EVENT.ToolResult, {
                            result: chunk.output,
                            durationMs,
                        });
                        set({ status: currentMachine?.state ?? status });
                        patchToolCall(chunk.toolCallId, { output: chunk.output, endedAt });
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
                        set({ status: currentMachine?.state ?? status });
                    } else if (chunk.type === 'text-delta') {
                        appendDelta('text', chunk.delta);
                    } else if (chunk.type === 'reasoning-delta') {
                        appendDelta('reasoning', chunk.delta);
                    }
                },
            });
            // A4 代际校验（裁决①）：旧代际流正常收尾不得覆盖新回合
            if (currentController !== null && currentController.signal !== signal) {
                return;
            }
            if (sendMachineEvent(ASSISTANT_EVENT.StreamEnd)) {
                set({ status: currentMachine?.state ?? 'done' }); // streaming→done
            } else if (
                currentMachine?.state === 'thinking' ||
                currentMachine?.state === 'tool_calling' ||
                currentMachine?.state === 'tool_result'
            ) {
                // 表缺口兜底（报告 §三）：空回复等场景忙碌态无 STREAM_END 边，回合已成功结束，store 直设 done
                set({ status: 'done' });
            }
            // error / aborted：保持终态，不被收尾顶掉
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
            const sent = sendMachineEvent(ASSISTANT_EVENT.Error);
            if (sent) {
                set({ status: currentMachine?.state ?? 'error', error: message });
            } else {
                // 表缺口兜底（报告 §三）：thinking / tool_result 无 ERROR 边（如首帧前的网络失败），
                // machine 滞留原态，store 直设 error 保证横幅与输入恢复；machine 续跑见回合开头注释
                set({ status: 'error', error: message });
            }
        } finally {
            if (currentController?.signal === signal) {
                currentController = null;
            }
        }
    },

    abort() {
        const { status } = get();
        if (!isAssistantBusy(status)) {
            return;
        }
        currentController?.abort();
        // 立即停驻 aborted，不等流抛出，停止按钮反馈即时
        sendMachineEvent(ASSISTANT_EVENT.UserAbort);
        set({ status: 'aborted', error: null });
    },

    reset() {
        currentController?.abort();
        currentController = null;
        currentMachine = null;
        set({ messages: [], status: 'idle', error: null });
    },
}));
