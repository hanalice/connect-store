// placeOrder 单测（G3.2）：API-AI-01 未审批直接下单拦截（异构四态输入全拒绝、执行 0 次）、
// 审批通过正向执行、裁决① 实时计价（快照价变更后金额 = 新价）、输入契约校验。
// 全部走注入的订单表 / 数据源 / 时钟（A9 模式）。

import { describe, expect, it, vi } from 'vitest';
import { createOrderStore, priceOrderItems, type Product } from '../orders.js';
import { createPlaceOrderTool, placeOrderInputSchema } from './placeOrder.js';

const T0 = 1_000_000;
const TTL_MS = 300_000;

function makeWorld(initialPrice = 100) {
    let t = T0;
    const products: Product[] = [
        {
            id: 'p1',
            creator: 'c1',
            title: '商品一',
            pricingOption: 0,
            imagePath: '/p1.png',
            price: initialPrice,
        },
    ];
    const store = createOrderStore({ now: () => t });
    const tool = createPlaceOrderTool({ orderStore: store, products, now: () => t });
    const executeSpy = vi.spyOn(store, 'executeOrder');
    return { products, store, tool, executeSpy, tick: (ms: number) => (t += ms) };
}

/** 走真实策略等价路径：签发 →（可选审批）→ 返回 orderId。 */
function issueAndApprove(
    store: ReturnType<typeof createOrderStore>,
    toolCallId: string,
    approve: boolean,
) {
    const priced = priceOrderItems(
        [
            {
                id: 'p1',
                creator: 'c1',
                title: '商品一',
                pricingOption: 0,
                imagePath: '/p1.png',
                price: 100,
            },
        ],
        [{ productId: 'p1', quantity: 2 }],
    );
    if ('error' in priced) throw new Error(priced.error);
    const order = store.issueOrder({
        toolCallId,
        items: priced.items,
        amount: priced.amount,
        ttlMs: TTL_MS,
    });
    if (approve) store.approveOrder(order.orderId, T0 + 1);
    return order;
}

const EXEC = (toolCallId: string) => ({ toolCallId, messages: [], context: {} }) as never;

describe('placeOrderInputSchema 输入契约', () => {
    it('quantity 非正整数 / items 为空 / 条目缺字段 → safeParse 失败', () => {
        expect(
            placeOrderInputSchema.safeParse({ items: [{ productId: 'p1', quantity: 0 }] }).success,
        ).toBe(false);
        expect(
            placeOrderInputSchema.safeParse({ items: [{ productId: 'p1', quantity: 1.5 }] })
                .success,
        ).toBe(false);
        expect(placeOrderInputSchema.safeParse({ items: [] }).success).toBe(false);
        expect(placeOrderInputSchema.safeParse({ items: [{ quantity: 1 }] }).success).toBe(false);
    });

    it('cartId 可选；合法 items 通过', () => {
        expect(
            placeOrderInputSchema.safeParse({ items: [{ productId: 'p1', quantity: 1 }] }).success,
        ).toBe(true);
        expect(
            placeOrderInputSchema.safeParse({
                cartId: 'cart-1',
                items: [{ productId: 'p1', quantity: 1 }],
            }).success,
        ).toBe(true);
    });
});

describe('API-AI-01 未审批直接下单拦截（异构四态输入全拒绝，执行 0 次）', () => {
    it('从未签发的 toolCallId 调用 → { error }，不产生订单号', async () => {
        const { tool, executeSpy } = makeWorld();
        const output = await tool.execute(
            { items: [{ productId: 'p1', quantity: 1 }] },
            EXEC('call-ghost'),
        );
        expect(output).toEqual({ error: 'no issued order for tool call call-ghost' });
        expect(executeSpy).not.toHaveBeenCalled();
    });

    it('pending 状态调用 → { error: is pending }，执行 0 次', async () => {
        const { tool, store, executeSpy } = makeWorld();
        const order = issueAndApprove(store, 'call-pending', false);
        const output = await tool.execute(
            { items: [{ productId: 'p1', quantity: 2 }] },
            EXEC('call-pending'),
        );
        expect(output).toEqual({ error: `order ${order.orderId} is pending` });
        expect(executeSpy).not.toHaveBeenCalled();
    });

    it('rejected 状态调用 → { error: is rejected }，执行 0 次', async () => {
        const { tool, store, executeSpy } = makeWorld();
        const order = issueAndApprove(store, 'call-rejected', false);
        store.rejectOrder(order.orderId, T0 + 1, 'user rejected');
        const output = await tool.execute(
            { items: [{ productId: 'p1', quantity: 2 }] },
            EXEC('call-rejected'),
        );
        expect(output).toEqual({ error: `order ${order.orderId} is rejected` });
        expect(executeSpy).not.toHaveBeenCalled();
    });

    it('expired 状态调用 → { error: is expired }，执行 0 次', async () => {
        const { tool, store, executeSpy, tick } = makeWorld();
        const order = issueAndApprove(store, 'call-expired', false);
        tick(TTL_MS + 1);
        expect(store.queryOrder(order.orderId, T0 + TTL_MS + 1)?.status).toBe('expired');
        const output = await tool.execute(
            { items: [{ productId: 'p1', quantity: 2 }] },
            EXEC('call-expired'),
        );
        expect(output).toEqual({ error: `order ${order.orderId} is expired` });
        expect(executeSpy).not.toHaveBeenCalled();
    });
});

describe('API-AI-01 正向：approved 且未过期 → 执行返回订单号', () => {
    it('审批通过后执行 1 次：{ orderId, orderNumber(order- 前缀), amount }，审计 executed', async () => {
        const { tool, store, executeSpy } = makeWorld();
        const order = issueAndApprove(store, 'call-ok', true);
        const output = await tool.execute(
            { items: [{ productId: 'p1', quantity: 2 }] },
            EXEC('call-ok'),
        );
        expect(executeSpy).toHaveBeenCalledTimes(1);
        expect(output).toEqual({
            orderId: order.orderId,
            orderNumber: expect.stringMatching(/^order-[0-9a-f]{8}$/),
            amount: 200,
        });
        const record = store.getOrder(order.orderId);
        expect(record?.audit.map((e) => e.event)).toEqual(['issued', 'approved', 'executed']);
    });
});

describe('裁决① 实时计价（快照价变更后下单金额 = 新价）', () => {
    it('签发后快照价 100 → 120：执行金额 = 240（qty 2），条目 unitPrice 写回 120，不落签发旧价', async () => {
        const { tool, store, products } = makeWorld();
        const order = issueAndApprove(store, 'call-price', true);
        expect(order.amount).toBe(200); // 签发时刻快照价 100

        products[0] = { ...products[0]!, price: 120 }; // 快照价变更（加购时刻快照不回溯）
        const output = await tool.execute(
            { items: [{ productId: 'p1', quantity: 2 }] },
            EXEC('call-price'),
        );
        expect(output).toMatchObject({ amount: 240 });
        const record = store.getOrder(order.orderId);
        expect(record?.amount).toBe(240);
        expect(record?.items[0]).toMatchObject({ unitPrice: 120 });
        expect(record?.audit.find((e) => e.event === 'executed')?.detail).toContain('"amount":240');
    });

    it('执行时刻条目 id 在快照中不存在 → { error }，不产生订单号', async () => {
        const { tool, store, executeSpy } = makeWorld();
        const order = issueAndApprove(store, 'call-vanish', true);
        const output = await tool.execute(
            { items: [{ productId: 'ghost', quantity: 1 }] },
            EXEC('call-vanish'),
        );
        expect(output).toEqual({ error: 'product not found: ghost' });
        expect(executeSpy).not.toHaveBeenCalled();
        expect(store.getOrder(order.orderId)?.status).toBe('approved'); // 无副作用
    });
});
