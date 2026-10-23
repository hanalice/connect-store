/**
 * 前端纯函数状态机：design §5 的表驱动实现 `(state, event) → next`，零运行时 import
 * （不依赖 React / Zustand / 任何库与兄弟模块，测试与复用零成本）。
 * 事件枚举 12 个 = design §5 原有 11 个 + STREAM_START（缺口①裁决：补 thinking → streaming、
 * tool_result → streaming 两条边）；9 状态 = 7 主体 + error / aborted 2 附加，done 唯一终态。
 */

/** 9 状态：7 主体（idle/thinking/tool_calling/tool_result/streaming/await_human/done）+ 2 附加。 */
export type AssistantState =
    | 'idle'
    | 'thinking'
    | 'tool_calling'
    | 'tool_result'
    | 'streaming'
    | 'await_human'
    | 'done' // 唯一终态：无出边，任意事件打到 done 都走拒绝路径
    | 'error'
    | 'aborted';

/** const 对象 + type union（erasableSyntaxOnly 下 enum 不可编译）。 */
export const ASSISTANT_EVENT = {
    UserSend: 'USER_SEND',
    ToolCall: 'TOOL_CALL',
    StreamStart: 'STREAM_START', // 缺口①裁决新增
    ToolResult: 'TOOL_RESULT',
    StreamEnd: 'STREAM_END',
    ApprovalRequest: 'APPROVAL_REQUEST',
    Approve: 'APPROVE',
    Reject: 'REJECT',
    Edit: 'EDIT',
    UserAbort: 'USER_ABORT',
    Retry: 'RETRY',
    Error: 'ERROR',
} as const;
export type AssistantEvent = (typeof ASSISTANT_EVENT)[keyof typeof ASSISTANT_EVENT];

/** 状态全集（9），供遍历与单测断言表规模。 */
export const ASSISTANT_STATES = [
    'idle',
    'thinking',
    'tool_calling',
    'tool_result',
    'streaming',
    'await_human',
    'done',
    'error',
    'aborted',
] as const satisfies readonly AssistantState[];

/** 事件全集（12），供遍历与单测断言表规模。 */
export const ASSISTANT_EVENTS = [
    'USER_SEND',
    'TOOL_CALL',
    'STREAM_START',
    'TOOL_RESULT',
    'STREAM_END',
    'APPROVAL_REQUEST',
    'APPROVE',
    'REJECT',
    'EDIT',
    'USER_ABORT',
    'RETRY',
    'ERROR',
] as const satisfies readonly AssistantEvent[];

/**
 * 转换表：20 条合法 `(state, event) → next`，design §5 mermaid 逐条翻译
 * （19 个唯一状态对，await_human → tool_calling 由 APPROVE / EDIT 共享）。
 * 9 状态 × 12 事件 = 108 组合，表中不存在的 88 个为非法组合，send() 显式拒绝。
 */
export const TRANSITIONS: Readonly<
    Record<AssistantState, Readonly<Partial<Record<AssistantEvent, AssistantState>>>>
> = {
    idle: { USER_SEND: 'thinking' },
    thinking: {
        TOOL_CALL: 'tool_calling',
        STREAM_START: 'streaming',
        USER_ABORT: 'aborted',
    },
    tool_calling: {
        TOOL_RESULT: 'tool_result',
        USER_ABORT: 'aborted',
        ERROR: 'error',
    },
    tool_result: {
        TOOL_CALL: 'tool_calling',
        STREAM_START: 'streaming',
        USER_ABORT: 'aborted',
    },
    streaming: {
        APPROVAL_REQUEST: 'await_human',
        STREAM_END: 'done',
        USER_ABORT: 'aborted',
        ERROR: 'error',
    },
    await_human: {
        APPROVE: 'tool_calling',
        REJECT: 'thinking',
        EDIT: 'tool_calling',
        USER_ABORT: 'aborted',
    },
    done: {},
    error: { RETRY: 'idle' },
    aborted: { USER_SEND: 'thinking' },
};

/** 事件日志 entry：design §5 口径 `{ from, to, event, tool?, args?, result?, ts, durationMs }`。 */
export interface TransitionLogEntry {
    from: AssistantState;
    to: AssistantState;
    event: AssistantEvent;
    tool?: string;
    args?: unknown;
    result?: unknown;
    ts: number; // 转换时刻，取自注入时钟
    durationMs: number; // 该次转换耗时（工具执行场景由调用方传入；默认 0）
}

export interface MachineSendResult {
    state: AssistantState; // 发送后状态；拒绝时 = 原状态不变
    entry: TransitionLogEntry | null; // 成功转换的日志 entry；拒绝时为 null
    rejected: boolean;
}

/** send() 的 detail：tool / args / result 透传进日志，不校验内容。 */
export interface MachineSendDetail {
    tool?: string;
    args?: unknown;
    result?: unknown;
    durationMs?: number;
}

export interface AssistantMachine {
    readonly state: AssistantState; // 初始 'idle'
    readonly log: readonly TransitionLogEntry[]; // 环形缓冲只读视图，oldest → newest
    send(event: AssistantEvent, detail?: MachineSendDetail): MachineSendResult;
}

/** 事件日志环形缓冲上限（design §5）：第 201 条起驱逐最旧（FIFO）。 */
const LOG_CAPACITY = 200;

/**
 * 创建状态机实例。`now` 为可注入时钟（单测用假时钟断言 ts 单调不减），默认 Date.now。
 */
export function createAssistantMachine(now: () => number = Date.now): AssistantMachine {
    let state: AssistantState = 'idle';
    // 环形缓冲：head = 最旧 entry 下标，size ≤ LOG_CAPACITY；只写 [head, head+size) 区间
    const buffer: (TransitionLogEntry | undefined)[] = Array.from({ length: LOG_CAPACITY });
    let head = 0;
    let size = 0;

    const append = (entry: TransitionLogEntry): void => {
        if (size === LOG_CAPACITY) {
            buffer[head] = entry;
            head = (head + 1) % LOG_CAPACITY;
            return;
        }
        buffer[(head + size) % LOG_CAPACITY] = entry;
        size += 1;
    };

    return {
        get state() {
            return state;
        },
        get log(): readonly TransitionLogEntry[] {
            const view: TransitionLogEntry[] = [];
            for (let i = 0; i < size; i += 1) {
                const entry = buffer[(head + i) % LOG_CAPACITY];
                if (entry !== undefined) view.push(entry);
            }
            return view;
        },
        send(event, detail) {
            const next = TRANSITIONS[state][event];
            if (next === undefined) {
                console.warn(
                    `[assistantMachine] 非法转换被拒绝：state="${state}" event="${event}"（状态不变，日志不写 entry）`,
                );
                return { state, entry: null, rejected: true };
            }
            const entry: TransitionLogEntry = {
                from: state,
                to: next,
                event,
                ts: now(),
                durationMs: detail?.durationMs ?? 0,
            };
            if (detail?.tool !== undefined) entry.tool = detail.tool;
            if (detail?.args !== undefined) entry.args = detail.args;
            if (detail?.result !== undefined) entry.result = detail.result;
            append(entry);
            state = next;
            return { state, entry, rejected: false };
        },
    };
}
