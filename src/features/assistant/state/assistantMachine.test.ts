import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssistantEvent, AssistantState } from './assistantMachine';
import {
    ASSISTANT_EVENT,
    ASSISTANT_EVENTS,
    ASSISTANT_STATES,
    createAssistantMachine,
    TRANSITIONS,
} from './assistantMachine';

describe('assistantMachine', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('UT-ASM-01: Direct Response Flow', () => {
        const machine = createAssistantMachine();
        expect(machine.state).toBe('idle');

        machine.send(ASSISTANT_EVENT.UserSend);
        expect(machine.state).toBe('thinking');
        machine.send(ASSISTANT_EVENT.StreamStart);
        expect(machine.state).toBe('streaming');
        machine.send(ASSISTANT_EVENT.StreamEnd);
        expect(machine.state).toBe('done');

        expect(machine.log.map((entry) => `${entry.from}->${entry.to}`)).toEqual([
            'idle->thinking',
            'thinking->streaming',
            'streaming->done',
        ]);
        expect(machine.log.map((entry) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'STREAM_END',
        ]);
        expect(machine.log[0]).toMatchObject({
            from: 'idle',
            to: 'thinking',
            event: 'USER_SEND',
            ts: expect.any(Number),
            durationMs: 0, // 未传 durationMs 默认 0
        });
    });

    it('UT-ASM-02: Single Tool Execution Flow', () => {
        const machine = createAssistantMachine();
        machine.send(ASSISTANT_EVENT.UserSend);
        machine.send(ASSISTANT_EVENT.ToolCall, { tool: 'searchCatalog', args: { maxPrice: 20 } });
        expect(machine.state).toBe('tool_calling');

        machine.send(ASSISTANT_EVENT.ToolResult, { result: { total: 14 }, durationMs: 320 });
        expect(machine.state).toBe('tool_result');
        machine.send(ASSISTANT_EVENT.StreamStart);
        expect(machine.state).toBe('streaming');
        machine.send(ASSISTANT_EVENT.StreamEnd);
        expect(machine.state).toBe('done');

        // detail 透传进日志：TOOL_CALL 带 tool/args，TOOL_RESULT 带 result/durationMs
        expect(machine.log[1]).toMatchObject({
            event: 'TOOL_CALL',
            tool: 'searchCatalog',
            args: { maxPrice: 20 },
        });
        expect(machine.log[2]).toMatchObject({
            event: 'TOOL_RESULT',
            result: { total: 14 },
            durationMs: 320,
        });
        // 未传 detail 的 entry 不写 tool/args/result 字段
        expect(machine.log[0]).not.toHaveProperty('tool');
        expect(machine.log[0]).not.toHaveProperty('args');
        expect(machine.log[0]).not.toHaveProperty('result');
    });

    it('UT-ASM-03: Multi-Tool Calling Loop', () => {
        const machine = createAssistantMachine();
        machine.send(ASSISTANT_EVENT.UserSend);
        machine.send(ASSISTANT_EVENT.ToolCall, { tool: 'searchCatalog', args: { query: 'shirt' } });
        machine.send(ASSISTANT_EVENT.ToolResult, { result: { total: 3 } });
        expect(machine.state).toBe('tool_result');

        // LLM 基于第一个工具结果请求第二个工具：tool_result →(TOOL_CALL) tool_calling
        machine.send(ASSISTANT_EVENT.ToolCall, {
            tool: 'addToCart',
            args: { productId: 'content-001' },
        });
        expect(machine.state).toBe('tool_calling');
        machine.send(ASSISTANT_EVENT.ToolResult, { result: { ok: true }, durationMs: 88 });
        expect(machine.state).toBe('tool_result');

        expect(machine.log.map((entry) => entry.event)).toEqual([
            'USER_SEND',
            'TOOL_CALL',
            'TOOL_RESULT',
            'TOOL_CALL',
            'TOOL_RESULT',
        ]);
        expect(
            machine.log
                .filter((entry) => entry.event === 'TOOL_CALL')
                .map((entry) => `${entry.tool}(${JSON.stringify(entry.args)})`),
        ).toEqual(['searchCatalog({"query":"shirt"})', 'addToCart({"productId":"content-001"})']);
    });

    it('UT-ASM-04: HITL Approval Flow', () => {
        const machine = createAssistantMachine();
        machine.send(ASSISTANT_EVENT.UserSend);
        machine.send(ASSISTANT_EVENT.StreamStart);
        expect(machine.state).toBe('streaming');

        machine.send(ASSISTANT_EVENT.ApprovalRequest);
        expect(machine.state).toBe('await_human');
        machine.send(ASSISTANT_EVENT.Approve);
        expect(machine.state).toBe('tool_calling');
        machine.send(ASSISTANT_EVENT.ToolResult, { result: { orderId: 'ord-1' }, durationMs: 150 });
        expect(machine.state).toBe('tool_result');
        machine.send(ASSISTANT_EVENT.StreamStart);
        expect(machine.state).toBe('streaming');
        machine.send(ASSISTANT_EVENT.StreamEnd);
        expect(machine.state).toBe('done');

        expect(machine.log.map((entry) => `${entry.from}->${entry.to}`)).toEqual([
            'idle->thinking',
            'thinking->streaming',
            'streaming->await_human',
            'await_human->tool_calling',
            'tool_calling->tool_result',
            'tool_result->streaming',
            'streaming->done',
        ]);
    });

    it('UT-ASM-05: HITL Rejection & Plan Amendment', () => {
        const machine = createAssistantMachine();
        machine.send(ASSISTANT_EVENT.UserSend);
        machine.send(ASSISTANT_EVENT.StreamStart);
        machine.send(ASSISTANT_EVENT.ApprovalRequest);
        expect(machine.state).toBe('await_human');

        const result = machine.send(ASSISTANT_EVENT.Reject);
        expect(result.rejected).toBe(false);
        expect(machine.state).toBe('thinking');
        expect(machine.log.at(-1)).toMatchObject({
            from: 'await_human',
            to: 'thinking',
            event: 'REJECT',
        });
    });

    it('UT-ASM-06: HITL Edit Flow', () => {
        const machine = createAssistantMachine();
        machine.send(ASSISTANT_EVENT.UserSend);
        machine.send(ASSISTANT_EVENT.StreamStart);
        machine.send(ASSISTANT_EVENT.ApprovalRequest);
        expect(machine.state).toBe('await_human');

        const result = machine.send(ASSISTANT_EVENT.Edit);
        expect(result.rejected).toBe(false);
        expect(machine.state).toBe('tool_calling');
        expect(machine.log.at(-1)).toMatchObject({
            from: 'await_human',
            to: 'tool_calling',
            event: 'EDIT',
        });
    });

    it('UT-ASM-07: Illegal State Transition Rejection', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // 例 1：终态 done + 任意事件（done 无出边，12 个事件全拒绝；此处取 USER_SEND 实测）
        const doneMachine = createAssistantMachine();
        doneMachine.send(ASSISTANT_EVENT.UserSend);
        doneMachine.send(ASSISTANT_EVENT.StreamStart);
        doneMachine.send(ASSISTANT_EVENT.StreamEnd);
        expect(doneMachine.state).toBe('done');
        const logLength = doneMachine.log.length;

        const doneResult = doneMachine.send(ASSISTANT_EVENT.UserSend);
        expect(doneResult).toEqual({ state: 'done', entry: null, rejected: true });
        expect(doneMachine.state).toBe('done');
        expect(doneMachine.log).toHaveLength(logLength); // 日志不写 entry

        // 例 2：idle + TOOL_RESULT（组合不存在于转换表）
        const idleMachine = createAssistantMachine();
        const idleResult = idleMachine.send(ASSISTANT_EVENT.ToolResult);
        expect(idleResult).toEqual({ state: 'idle', entry: null, rejected: true });
        expect(idleMachine.state).toBe('idle');
        expect(idleMachine.log).toHaveLength(0);

        // warning logged：含 state + event 的明确文案
        expect(warnSpy).toHaveBeenCalledTimes(2);
        const [message] = warnSpy.mock.calls[0] as [string];
        expect(message).toContain('state="done"');
        expect(message).toContain('event="USER_SEND"');
        expect(warnSpy.mock.calls[1]?.[0]).toContain('state="idle"');
        expect(warnSpy.mock.calls[1]?.[0]).toContain('event="TOOL_RESULT"');
    });

    it('UT-ASM-08: Ring Buffer Event History & Retention', () => {
        let tick = 0;
        // 假时钟：ts = 转换序号（第 k 次成功转换 ts = k）
        const machine = createAssistantMachine(() => {
            tick += 1;
            return tick;
        });

        // idle →(USER_SEND) thinking →(USER_ABORT) aborted → 交替循环，全部合法
        const sequence: AssistantEvent[] = [ASSISTANT_EVENT.UserSend, ASSISTANT_EVENT.UserAbort];
        const send = (index: number) => machine.send(sequence[index % sequence.length]);

        // 第 200 条插入后：缓冲刚好满，首条 = 第 1 条
        for (let i = 0; i < 200; i += 1) send(i);
        expect(machine.log).toHaveLength(200);
        expect(machine.log[0].ts).toBe(1);
        expect(machine.log[199].ts).toBe(200);

        // 第 201 条插入后：驱逐最旧（FIFO），首条变为第 2 条
        send(200);
        expect(machine.log).toHaveLength(200);
        expect(machine.log[0].ts).toBe(2);
        expect(machine.log[0]).toMatchObject({
            event: 'USER_ABORT',
            from: 'thinking',
            to: 'aborted',
        });
        expect(machine.log[199].ts).toBe(201);

        // 继续到总计 210 条：首条 = 第 n-199 条（210 - 199 = 11），FIFO 顺序保持
        for (let i = 201; i < 210; i += 1) send(i);
        expect(machine.log).toHaveLength(200);
        expect(machine.log[0].ts).toBe(210 - 199);
        expect(machine.log[0]).toMatchObject({
            event: 'USER_SEND',
            from: 'aborted',
            to: 'thinking',
        });
        expect(machine.log[199].ts).toBe(210);
        expect(machine.log[199]).toMatchObject({
            event: 'USER_ABORT',
            from: 'thinking',
            to: 'aborted',
        });

        // ts 单调不减（假时钟严格递增，此处断言 >= 口径）
        const log = machine.log;
        for (let i = 1; i < log.length; i += 1) {
            expect(log[i].ts).toBeGreaterThanOrEqual(log[i - 1].ts);
        }
    });

    it('UT-ASM-09: Stream Failure & Error Recovery', () => {
        // streaming →(ERROR) error →(RETRY) idle
        const machine = createAssistantMachine();
        machine.send(ASSISTANT_EVENT.UserSend);
        machine.send(ASSISTANT_EVENT.StreamStart);
        machine.send(ASSISTANT_EVENT.Error);
        expect(machine.state).toBe('error');
        expect(machine.log.at(-1)).toMatchObject({
            from: 'streaming',
            to: 'error',
            event: 'ERROR',
        });

        const retry = machine.send(ASSISTANT_EVENT.Retry);
        expect(retry.rejected).toBe(false);
        expect(machine.state).toBe('idle');

        // tool_calling →(ERROR) error（工具失败重试后；ERROR 统一覆盖流中断与工具失败）
        const toolMachine = createAssistantMachine();
        toolMachine.send(ASSISTANT_EVENT.UserSend);
        toolMachine.send(ASSISTANT_EVENT.ToolCall, { tool: 'searchCatalog' });
        toolMachine.send(ASSISTANT_EVENT.Error);
        expect(toolMachine.state).toBe('error');
        expect(toolMachine.log.at(-1)).toMatchObject({
            from: 'tool_calling',
            to: 'error',
            event: 'ERROR',
        });
    });

    it('aborted 六边全覆盖：用户点停止 ×4 + 取消订单 + USER_SEND 恢复（design §5 三约束）', () => {
        // 四条「用户点停止」边：thinking / streaming / tool_calling / tool_result + USER_ABORT
        const stopCases: Array<{ path: AssistantEvent[]; from: AssistantState }> = [
            { path: [ASSISTANT_EVENT.UserSend], from: 'thinking' },
            { path: [ASSISTANT_EVENT.UserSend, ASSISTANT_EVENT.StreamStart], from: 'streaming' },
            { path: [ASSISTANT_EVENT.UserSend, ASSISTANT_EVENT.ToolCall], from: 'tool_calling' },
            {
                path: [
                    ASSISTANT_EVENT.UserSend,
                    ASSISTANT_EVENT.ToolCall,
                    ASSISTANT_EVENT.ToolResult,
                ],
                from: 'tool_result',
            },
        ];
        for (const { path, from } of stopCases) {
            const machine = createAssistantMachine();
            for (const event of path) machine.send(event);
            const result = machine.send(ASSISTANT_EVENT.UserAbort);
            expect(result.rejected).toBe(false);
            expect(machine.state).toBe('aborted');
            expect(machine.log.at(-1)).toMatchObject({ from, to: 'aborted', event: 'USER_ABORT' });
        }

        // await_human →(USER_ABORT) aborted：用户取消订单（HITL 唯一取消去向）
        const hitl = createAssistantMachine();
        hitl.send(ASSISTANT_EVENT.UserSend);
        hitl.send(ASSISTANT_EVENT.StreamStart);
        hitl.send(ASSISTANT_EVENT.ApprovalRequest);
        expect(hitl.state).toBe('await_human');
        hitl.send(ASSISTANT_EVENT.UserAbort);
        expect(hitl.state).toBe('aborted');
        expect(hitl.log.at(-1)).toMatchObject({
            from: 'await_human',
            to: 'aborted',
            event: 'USER_ABORT',
        });

        // aborted →(USER_SEND) thinking：用户继续发消息（不自动重发语义由 store 层保证）
        const recover = hitl.send(ASSISTANT_EVENT.UserSend);
        expect(recover.rejected).toBe(false);
        expect(hitl.state).toBe('thinking');
    });

    it('转换表规模：9 状态 × 12 事件 = 108 组合，合法 20、非法 88', () => {
        expect(ASSISTANT_STATES).toHaveLength(9);
        expect(ASSISTANT_EVENTS).toHaveLength(12);

        let legal = 0;
        for (const state of ASSISTANT_STATES) {
            for (const event of ASSISTANT_EVENTS) {
                if (TRANSITIONS[state][event] !== undefined) legal += 1;
            }
        }
        expect(legal).toBe(20);
        expect(ASSISTANT_STATES.length * ASSISTANT_EVENTS.length - legal).toBe(88);

        // done 终态拒绝实测（静态口径）：done 的全部 12 个事件均无出边
        for (const event of ASSISTANT_EVENTS) {
            expect(TRANSITIONS.done[event]).toBeUndefined();
        }
    });
});
