import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalCard, type ApprovalCardItem } from './ApprovalCard';

const ITEMS: ApprovalCardItem[] = [
    { productId: 'p-order-1', title: '付费模板 Alpha', quantity: 1, unitPrice: 10 },
    { productId: 'p-order-2', title: '音效包 Beta', quantity: 2, unitPrice: 7.5 },
];

/** 未过期时刻（组件内 Date.now 对照）。 */
const FUTURE = Date.now() + 300_000;

function renderCard(overrides: Partial<Parameters<typeof ApprovalCard>[0]> = {}) {
    const props: Parameters<typeof ApprovalCard>[0] = {
        items: ITEMS,
        approvalId: 'appr-1',
        expiresAt: FUTURE,
        phase: 'pending',
        onApprove: vi.fn(),
        onReject: vi.fn(),
        onEditConfirm: vi.fn(),
        onCancel: vi.fn(),
        ...overrides,
    };
    render(<ApprovalCard {...props} />);
    return props;
}

describe('ApprovalCard（G3.3 裁决② 整体替换：props 驱动纯展示 + 回调）', () => {
    it('订单摘要渲染：条目（标题/数量/小计）+ 合计 + 审批单号 + TTL 倒计时', () => {
        renderCard();
        expect(screen.getByTestId('approval-card')).toBeInTheDocument();
        expect(screen.getByText('付费模板 Alpha')).toBeInTheDocument();
        expect(screen.getByText('× 1')).toBeInTheDocument();
        expect(screen.getByText('$10.00')).toBeInTheDocument();
        expect(screen.getByText('音效包 Beta')).toBeInTheDocument();
        expect(screen.getByText('× 2')).toBeInTheDocument();
        expect(screen.getByText('$15.00')).toBeInTheDocument();
        // 合计 = 10×1 + 7.5×2 = 25.00
        expect(screen.getByText('合计 $25.00')).toBeInTheDocument();
        expect(screen.getByText('审批单号 appr-1')).toBeInTheDocument();
        expect(screen.getByText(/剩余 \d+:\d{2}/)).toBeInTheDocument();
    });

    it('INT-HITL-01 approve：确认下单回调 fired，卡转执行中态（按钮禁用 + 执行中提示）', async () => {
        const props = renderCard();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '确认下单' }));
        expect(props.onApprove).toHaveBeenCalledTimes(1);

        // store 决策后 phase=approved：卡转执行中态（决策按钮禁用）
        render(
            <ApprovalCard {...props} phase="approved" />,
            // 卸载旧卡避免双卡：用 cleanup 由 RTL 自动处理——这里直接断言第二实例
        );
        const cards = screen.getAllByTestId('approval-card');
        const executing = cards[cards.length - 1];
        expect(executing).toHaveTextContent('订单执行中…');
        expect(screen.getAllByRole('button', { name: '确认下单' }).at(-1)).toBeDisabled();
    });

    it('INT-HITL-02 reject + reason：预设原因「太贵了」随回调携带；决策后卡展示拒绝原因', async () => {
        const props = renderCard();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '拒绝' }));
        // 预设 reason 最小形态：默认选中「太贵了」，确认拒绝携带 reason
        await user.click(screen.getByRole('button', { name: '确认拒绝' }));
        expect(props.onReject).toHaveBeenCalledWith('太贵了');

        render(<ApprovalCard {...props} phase="rejected" decisionReason="太贵了" />);
        const cards = screen.getAllByTestId('approval-card');
        expect(cards[cards.length - 1]).toHaveTextContent('已拒绝：太贵了');
    });

    it('INT-HITL-02 reject 自定义原因：文本输入覆盖预设项后随回调携带', async () => {
        const props = renderCard();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '拒绝' }));
        await user.type(screen.getByLabelText('自定义拒绝原因'), '预算不够{tab}'); // tab 移焦触发 onChange 已完成
        await user.click(screen.getByRole('button', { name: '确认拒绝' }));
        expect(props.onReject).toHaveBeenCalledWith('预算不够');
    });

    it('INT-HITL-03 edit：数量步进 + 移除条目，确认回调携带修改后 items 且合计实时重算', async () => {
        const props = renderCard();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '修改' }));

        // 步进：音效包 Beta 2 → 3，小计 15.00 → 22.50，合计 25.00 → 32.50
        await user.click(screen.getByRole('button', { name: '增加 音效包 Beta' }));
        expect(screen.getByTestId('edit-qty-p-order-2')).toHaveTextContent('3');
        expect(screen.getByText('$22.50')).toBeInTheDocument();
        expect(screen.getByText('合计 $32.50')).toBeInTheDocument();

        // 移除：付费模板 Alpha 移除后仅剩 Beta
        await user.click(screen.getByRole('button', { name: '移除 付费模板 Alpha' }));
        expect(screen.queryByText('付费模板 Alpha')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '确认修改并重新发起' }));
        expect(props.onEditConfirm).toHaveBeenCalledWith([{ productId: 'p-order-2', quantity: 3 }]);

        // 决策后卡展示「已修改并重新发起」
        render(<ApprovalCard {...props} phase="edited" />);
        const cards = screen.getAllByTestId('approval-card');
        expect(cards[cards.length - 1]).toHaveTextContent('已修改并重新发起');
    });

    it('INT-HITL-04 TTL 过期：倒计时归零 → 决策按钮禁用 + 「已过期，请重新发起」提示', () => {
        renderCard({ expiresAt: Date.now() - 1 });
        expect(screen.getByText('已过期，请重新发起')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '确认下单' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '拒绝' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '修改' })).toBeDisabled();
        // 取消订单是退出路径，保持可用（报告口径：决策按钮禁用，取消不禁用）
        expect(screen.getByRole('button', { name: '取消订单' })).toBeEnabled();
    });

    it('取消订单回调 fired（await_human 取消 = abort，裁决⑤）', async () => {
        const props = renderCard();
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: '取消订单' }));
        expect(props.onCancel).toHaveBeenCalledTimes(1);
    });
});
