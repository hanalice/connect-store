import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Product } from '../../catalog/types/product';
import { renderToolOutput } from './renderToolOutput';
import { UI_REGISTRY } from './uiRegistry';
import styles from './uiRegistry.module.scss';

const productA: Product = {
    id: 'p1',
    creator: 'Creator A',
    title: '免费素材 Alpha',
    pricingOption: 1,
    imagePath: '',
    price: 0,
};

const productB: Product = {
    id: 'p2',
    creator: 'Creator B',
    title: '付费模板 Beta',
    pricingOption: 0,
    imagePath: '',
    price: 12.5,
};

describe('uiRegistry 白名单分发', () => {
    it('UT-REG-01 白名单放行：tool-searchCatalog 合法输出（2 件商品）→ 渲染真实 ProductCard 而非纯文本', () => {
        const { container } = render(
            renderToolOutput({
                toolName: 'searchCatalog',
                output: { items: [productA, productB], total: 2 },
            }),
        );

        // 真实 ProductCard：命名 article + aria-label 结构（{title} by {creator}, price …）
        const cards = screen.getAllByRole('article');
        expect(cards).toHaveLength(2);
        expect(cards[0]).toHaveAttribute('aria-label', '免费素材 Alpha by Creator A, price Free');
        expect(cards[1]).toHaveAttribute('aria-label', '付费模板 Beta by Creator B, price $12.50');
        // 标题 / 价格文本（非纯文本摘要的证据：具体商品字段逐项可见）
        expect(screen.getByText('免费素材 Alpha')).toBeInTheDocument();
        expect(screen.getByText('$12.50')).toBeInTheDocument();
        // 复用存量 ProductGrid（section.grid）+ 裁决⑥ 的 2 列 wrapper class
        const wrapper = container.querySelector('[data-testid="tool-search-catalog-grid"]');
        expect(wrapper).not.toBeNull();
        expect(wrapper!.className).toContain(styles.toolGrid);
        expect(wrapper!.querySelector('section')).not.toBeNull();
    });

    it('UT-REG-02 未知组件阻断：未注册 toolName（deleteAccount / dynamic tool call）→ fallback 文本，不渲染任何卡片、不崩溃', () => {
        for (const toolName of ['deleteAccount', 'someDynamicTool']) {
            const { container, unmount } = render(
                renderToolOutput({ toolName, output: { deleted: true } }),
            );
            expect(screen.getByText('暂不支持展示该工具的结果')).toBeInTheDocument();
            // 绝不渲染任意组件：无卡片 / 无 grid / 无错误卡
            expect(container.querySelectorAll('[role="article"]')).toHaveLength(0);
            expect(container.querySelector('section')).toBeNull();
            unmount();
        }
    });

    it('UT-REG-03 schema 校验失败：price 为 string → 内联错误指示，不渲染坏数据', () => {
        const { container } = render(
            renderToolOutput({
                toolName: 'searchCatalog',
                output: { items: [{ ...productA, price: '0' }], total: 1 },
            }),
        );

        // 内联错误指示（不静默吞、不重定向）
        expect(screen.getByText('输出格式校验失败')).toBeInTheDocument();
        expect(screen.getByText('已拒绝渲染无效的工具输出')).toBeInTheDocument();
        // 坏数据不渲染：商品标题与卡片均不存在
        expect(screen.queryByText('免费素材 Alpha')).not.toBeInTheDocument();
        expect(container.querySelectorAll('[role="article"]')).toHaveLength(0);
    });

    it('UT-REG-04 错误边界：注册组件渲染抛错 → ErrorBoundary 捕获、本地化 fallback、对话流不中断', () => {
        UI_REGISTRY['tool-boom'] = () => {
            throw new Error('boom');
        };
        try {
            render(
                <div>
                    <span>前文文本</span>
                    {renderToolOutput({ toolName: 'boom', output: {} })}
                </div>,
            );
            // 本地化 fallback 渲染
            expect(screen.getByText('该工具结果卡片渲染失败')).toBeInTheDocument();
            // 兄弟节点不受影响：对话流不中断
            expect(screen.getByText('前文文本')).toBeInTheDocument();
        } finally {
            delete UI_REGISTRY['tool-boom'];
        }
    });

    it('分支：tool-searchCatalog 空结果 → 复用存量 EmptyState', () => {
        render(renderToolOutput({ toolName: 'searchCatalog', output: { items: [], total: 0 } }));
        expect(screen.getByText('No contents matched your current criteria.')).toBeInTheDocument();
        expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });

    it('分支：tool-searchCatalog 输出体内 error 字段 → ToolError 卡片', () => {
        render(
            renderToolOutput({
                toolName: 'searchCatalog',
                output: { error: 'catalog snapshot unavailable' },
            }),
        );
        expect(screen.getByText('工具执行失败')).toBeInTheDocument();
        expect(screen.getByText('catalog snapshot unavailable')).toBeInTheDocument();
    });

    it('分支：tool-searchCatalog 协议层 error（tool-output-error）→ ToolError 卡片', () => {
        render(renderToolOutput({ toolName: 'searchCatalog', error: 'tool crashed' }));
        expect(screen.getByText('工具执行失败')).toBeInTheDocument();
        expect(screen.getByText('tool crashed')).toBeInTheDocument();
    });

    it('分支：tool-getProductDetails 命中 → PriceBreakdown（价格 / 计价方式 / 拆分项）', () => {
        render(renderToolOutput({ toolName: 'getProductDetails', output: { product: productB } }));
        expect(screen.getByText('付费模板 Beta')).toBeInTheDocument();
        expect(screen.getByText('计价方式')).toBeInTheDocument();
        expect(screen.getByText('Paid')).toBeInTheDocument();
        // 单价与合计两处金额（货币口径 $ + 两位小数）
        expect(screen.getAllByText('$12.50')).toHaveLength(2);
    });

    it('分支：tool-getProductDetails 未命中（输出体内 error）→ ToolError 卡片', () => {
        render(
            renderToolOutput({
                toolName: 'getProductDetails',
                output: { error: 'product not found' },
            }),
        );
        expect(screen.getByText('工具执行失败')).toBeInTheDocument();
        expect(screen.getByText('product not found')).toBeInTheDocument();
    });

    it('分支：tool-placeOrder 执行回执 → OrderResultCard（G3.3：订单号 / 实付金额 / 单号）', () => {
        render(
            renderToolOutput({
                toolName: 'placeOrder',
                output: { orderId: 'ord-e2e-1', orderNumber: 'order-e2e0001', amount: 25 },
            }),
        );
        expect(screen.getByTestId('order-result-card')).toBeInTheDocument();
        expect(screen.getByText('订单号：order-e2e0001')).toBeInTheDocument();
        expect(screen.getByText('实付金额：$25.00')).toBeInTheDocument();
        expect(screen.getByText('单号 ord-e2e-1')).toBeInTheDocument();
    });

    it('分支：tool-placeOrder 输出体内 error 回执 → ToolError 卡片（未执行分流）', () => {
        render(renderToolOutput({ toolName: 'placeOrder', output: { error: 'order is pending' } }));
        expect(screen.getByText('工具执行失败')).toBeInTheDocument();
        expect(screen.getByText('order is pending')).toBeInTheDocument();
    });

    it('分支：tool-addToCart 成功回执 → CartConfirmCard（G3.1：件数 / 标题 / 小计）', () => {
        render(
            renderToolOutput({
                toolName: 'addToCart',
                output: { productId: 'p2', quantity: 2, product: productB },
            }),
        );
        expect(screen.getByTestId('cart-confirm-card')).toBeInTheDocument();
        expect(screen.getByText('✓ 已加入 2 件「付费模板 Beta」')).toBeInTheDocument();
        expect(screen.getByText('小计 $25.00')).toBeInTheDocument();
    });

    it('分支：tool-addToCart 输出体内 error 回执 → ToolError 卡片（error 分流先于 schema）', () => {
        render(
            renderToolOutput({
                toolName: 'addToCart',
                output: { error: 'product not found: p-x' },
            }),
        );
        expect(screen.getByText('工具执行失败')).toBeInTheDocument();
        expect(screen.getByText('product not found: p-x')).toBeInTheDocument();
        expect(screen.queryByTestId('cart-confirm-card')).toBeNull();
    });

    it('分支：tool-addToCart 畸形回执（quantity 非正整数）→ 内联校验失败指示，不渲染坏数据', () => {
        render(
            renderToolOutput({
                toolName: 'addToCart',
                output: { productId: 'p2', quantity: 0, product: productB },
            }),
        );
        expect(screen.getByText('输出格式校验失败')).toBeInTheDocument();
        expect(screen.getByText('已拒绝渲染无效的工具输出')).toBeInTheDocument();
        expect(screen.queryByTestId('cart-confirm-card')).toBeNull();
    });

    it('分支：tool-clearCart 成功回执 → ClearCartConfirmCard（G5.1 裁决①-b：已清空确认）', () => {
        render(renderToolOutput({ toolName: 'clearCart', output: { cleared: true } }));
        expect(screen.getByTestId('clear-cart-confirm-card')).toBeInTheDocument();
        expect(screen.getByText('✓ 已清空购物车')).toBeInTheDocument();
    });

    it('分支：tool-clearCart 输出体内 error 回执 → ToolError 卡片（error 分流先于 schema）', () => {
        render(renderToolOutput({ toolName: 'clearCart', output: { error: 'clear failed' } }));
        expect(screen.getByText('工具执行失败')).toBeInTheDocument();
        expect(screen.getByText('clear failed')).toBeInTheDocument();
        expect(screen.queryByTestId('clear-cart-confirm-card')).toBeNull();
    });

    it('分支：tool-clearCart 畸形回执（cleared 非 true）→ 内联校验失败指示，不渲染坏数据', () => {
        render(renderToolOutput({ toolName: 'clearCart', output: { cleared: false } }));
        expect(screen.getByText('输出格式校验失败')).toBeInTheDocument();
        expect(screen.getByText('已拒绝渲染无效的工具输出')).toBeInTheDocument();
        expect(screen.queryByTestId('clear-cart-confirm-card')).toBeNull();
    });
});
