import { act, render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAssistantStore } from '../state/useAssistantStore';
import type { ApprovalRequestState, ChatMessage } from '../types/assistant';
import { ChatPanel } from './ChatPanel';

function renderPanel() {
    return render(
        // HashRouter 与线上 router（createHashRouter）一致：Link to="/" 渲染 href="#/"
        <HashRouter>
            <ChatPanel />
        </HashRouter>,
    );
}

/** 审批卡可操作态的 approval 状态（挂到 a-1 assistant 消息上）。 */
const PENDING_APPROVAL: ApprovalRequestState = {
    approvalId: 'appr-1',
    toolCallId: 'call-order-1',
    messageId: 'a-1',
    toolName: 'placeOrder',
    rawInput: { items: [{ productId: 'p-order-1', quantity: 1 }] },
    items: [{ productId: 'p-order-1', quantity: 1 }],
    requestedAt: Date.now(),
    expiresAt: Date.now() + 300_000,
    phase: 'pending',
};

const ORDER_MESSAGES: ChatMessage[] = [
    { id: 'u-1', role: 'user', text: '帮我下单', reasoning: '' },
    { id: 'a-1', role: 'assistant', text: '请确认订单', reasoning: '', toolCalls: [] },
];

describe('ChatPanel G3.4 失败恢复（裁决②③ + A11Y-05）', () => {
    beforeEach(() => {
        useAssistantStore.getState().reset();
    });

    it('降级提示：error / aborted 双横幅均附「或回目录手动选购 →」链接（href #/ 目录页）', () => {
        useAssistantStore.setState({
            status: 'error',
            error: '无法连接服务器，请检查网络后重试',
        });
        renderPanel();
        const link = screen.getByRole('link', { name: '或回目录手动选购 →' });
        expect(link).toHaveAttribute('href', '#/');
        expect(screen.getByRole('alert')).toHaveTextContent('无法连接服务器');

        // aborted 横幅同样挂降级链接（裁决③：仅这两处，不扩散）
        act(() => {
            useAssistantStore.setState({ status: 'aborted', error: null });
        });
        expect(screen.getByText('已停止生成，可继续发送新消息')).toBeInTheDocument();
        const abortedLink = screen.getByRole('link', { name: '或回目录手动选购 →' });
        expect(abortedLink).toHaveAttribute('href', '#/');
    });

    it('重试按钮：error 横幅渲染「重试」按钮；aborted 横幅无重试按钮（aborted 三约束①：无重试语义）', () => {
        useAssistantStore.setState({ status: 'error', error: '上游模型服务错误' });
        renderPanel();
        expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();

        act(() => {
            useAssistantStore.setState({ status: 'aborted', error: null });
        });
        expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
    });

    it('A11Y-05 焦点管理：审批卡出现时焦点移入卡内首个可交互元素，决策后归还 composer', () => {
        useAssistantStore.setState({
            status: 'await_human',
            messages: ORDER_MESSAGES,
            approval: PENDING_APPROVAL,
        });
        renderPanel();

        // 卡 pending：焦点移入卡内首个可交互元素（确认下单）
        expect(document.activeElement).toBe(screen.getByRole('button', { name: '确认下单' }));

        // 决策（approve）→ 回放完成回到 done：composer 解锁，焦点归还
        act(() => {
            useAssistantStore.setState({
                status: 'done',
                approval: { ...PENDING_APPROVAL, phase: 'approved' },
            });
        });
        expect(document.activeElement).toBe(screen.getByLabelText('消息输入框'));
    });
});
