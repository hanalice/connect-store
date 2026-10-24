import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ASSISTANT_STATES, type AssistantState } from '../state/assistantMachine';
import { AgentStatusBadge } from './AgentStatusBadge';

/** 9 态静态投影的期望文案（与组件内 STATE_PROJECTION 对齐，改动任一侧即红）。 */
const EXPECTED_LABELS: Record<AssistantState, string> = {
    idle: '待命',
    thinking: '思考中',
    tool_calling: '调用工具',
    tool_result: '工具结果',
    streaming: '生成回复',
    await_human: '等待确认',
    done: '已完成',
    error: '出错',
    aborted: '已停止',
};

describe('AgentStatusBadge', () => {
    it('9 态静态投影：文案 + role="status" + aria-live（INT-AI-05）', () => {
        for (const state of ASSISTANT_STATES) {
            const { container, unmount } = render(<AgentStatusBadge status={state} />);
            const badge = screen.getByRole('status');
            expect(badge).toHaveTextContent(EXPECTED_LABELS[state]);
            expect(badge).toHaveAttribute('aria-live', 'polite');
            // 禁止 role="alert"：否则破坏 E2E-AI-03/06/07/08 的 alert 计数断言
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(container.querySelector('[role="alert"]')).toBeNull();
            unmount();
        }
    });
});
