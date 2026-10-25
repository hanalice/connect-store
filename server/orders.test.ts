// 订单表单测（G3.2，裁决⑥）：四态流转 + 审计完整性、惰性过期（API-AI-05）、
// 按 orderId 查询 404 语义（API-AI-04）、执行入口守卫（API-AI-01 的订单表层支撑）、
// 实时计价 helper（裁决①）。注入假时钟（A9 模式），禁止真实 sleep。

import { describe, expect, it } from 'vitest';
import { createOrderStore, priceOrderItems, type Product } from './orders.js';

const PRODUCTS: Product[] = [
    {
        id: 'p1',
        creator: 'c1',
        title: '商品一',
        pricingOption: 0,
        imagePath: '/p1.png',
        price: 100,
    },
    { id: 'p2', creator: 'c2', title: '商品二', pricingOption: 1, imagePath: '/p2.png', price: 10 },
];

/** 固定时钟起点（G0.4 实验同口径）。 */
const T0 = 1_000_000;
const TTL_MS = 300_000;

function makeStore() {
    let t = T0;
    const store = createOrderStore({ now: () => t });
    return { store, tick: (ms: number) => (t += ms), set: (v: number) => (t = v), now: () => t };
}

function issue(store: ReturnType<typeof createOrderStore>, toolCallId = 'call-1') {
    const priced = priceOrderItems(PRODUCTS, [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
    ]);
    if ('error' in priced) throw new Error(priced.error);
    return store.issueOrder({
        toolCallId,
        items: priced.items,
        amount: priced.amount,
        ttlMs: TTL_MS,
    });
}

describe('订单状态流转 + 审计完整性（issued → approved → executed）', () => {
    it('签发即 pending，audit 首条为 issued，expiresAt = issuedAt + TTL', () => {
        const { store } = makeStore();
        const order = issue(store);
        expect(order.status).toBe('pending');
        expect(order.issuedAt).toBe(T0);
        expect(order.expiresAt).toBe(T0 + TTL_MS);
        expect(order.audit.map((e) => e.event)).toEqual(['issued']);
    });

    it('approve → approved 记 decidedAt 与审计；仅 pending 可流转（approved 重复 approve 拒绝）', () => {
        const { store } = makeStore();
        const order = issue(store);
        const approved = store.approveOrder(order.orderId, T0 + 1);
        expect(approved?.status).toBe('approved');
        expect(approved?.decidedAt).toBe(T0 + 1);
        expect(approved?.audit.map((e) => e.event)).toEqual(['issued', 'approved']);
        // 状态守卫：非 pending 不可再次 approve / reject。
        expect(store.approveOrder(order.orderId, T0 + 2)).toBeUndefined();
        expect(store.rejectOrder(order.orderId, T0 + 2, 'x')).toBeUndefined();
    });

    it('executeOrder：approved 且未过 TTL → mock 订单号（order- 前缀），审计 executed，状态维持 approved', () => {
        const { store } = makeStore();
        const order = issue(store);
        store.approveOrder(order.orderId, T0 + 1);
        const result = store.executeOrder(order.orderId, T0 + 2, {
            items: order.items,
            amount: order.amount,
        });
        expect('error' in result).toBe(false);
        if ('error' in result) return;
        expect(result.orderNumber).toMatch(/^order-[0-9a-f]{8}$/);
        const after = store.getOrder(order.orderId);
        expect(after?.status).toBe('approved'); // 四态锁定：无 executed 态
        expect(after?.audit.map((e) => e.event)).toEqual(['issued', 'approved', 'executed']);
        const executed = after?.audit.find((e) => e.event === 'executed');
        expect(executed?.detail).toContain(result.orderNumber);
        expect(executed?.detail).toContain('"amount":210');
    });
});

describe('API-AI-05 / 惰性过期与 TTL 边界', () => {
    it('惰性过期：查询时 pending 超 TTL → 落 expired + 审计后返回（design §6.3 判定点②）', () => {
        const { store } = makeStore();
        const order = issue(store);
        const expired = store.queryOrder(order.orderId, T0 + TTL_MS + 1);
        expect(expired?.status).toBe('expired');
        expect(expired?.decidedAt).toBe(T0 + TTL_MS + 1);
        expect(expired?.audit.map((e) => e.event)).toEqual(['issued', 'expired']);
    });

    it('TTL 恰好 300,000ms 边界：未过期（queryOrder 不翻转）', () => {
        const { store } = makeStore();
        const order = issue(store);
        const atBoundary = store.queryOrder(order.orderId, T0 + TTL_MS);
        expect(atBoundary?.status).toBe('pending');
    });

    it('惰性过期幂等：expired 落盘后重复查询不重复记审计', () => {
        const { store } = makeStore();
        const order = issue(store);
        store.queryOrder(order.orderId, T0 + TTL_MS + 1);
        const again = store.queryOrder(order.orderId, T0 + TTL_MS + 2);
        expect(again?.audit.filter((e) => e.event === 'expired')).toHaveLength(1);
    });

    it('执行入口 TTL 双判定：approved 但执行时刻超 TTL → error + 落 expired，无订单号产生', () => {
        const { store } = makeStore();
        const order = issue(store);
        store.approveOrder(order.orderId, T0 + 1);
        const result = store.executeOrder(order.orderId, T0 + TTL_MS + 1, {
            items: order.items,
            amount: order.amount,
        });
        expect(result).toEqual({ error: expect.stringContaining('approval expired') });
        expect(store.getOrder(order.orderId)?.status).toBe('expired');
    });
});

describe('API-AI-04 / 按 orderId 查询 404 语义', () => {
    it('未知 orderId：getOrder / queryOrder 均 undefined（路由层据此 404，不暴露存在性）', () => {
        const { store } = makeStore();
        expect(store.getOrder('ord-no-such')).toBeUndefined();
        expect(store.queryOrder('ord-no-such', T0)).toBeUndefined();
    });

    it('findOrderByToolCallId：未命中返回 undefined（API-AI-01 拦截的查询前提）', () => {
        const { store } = makeStore();
        issue(store, 'call-real');
        expect(store.findOrderByToolCallId('call-real')?.status).toBe('pending');
        expect(store.findOrderByToolCallId('call-ghost')).toBeUndefined();
    });
});

describe('API-AI-01 / 执行入口状态守卫（未审批一律拦截）', () => {
    it('pending / rejected 状态执行 → { error }，审计不产生 executed', () => {
        const { store } = makeStore();
        const pendingOrder = issue(store);
        const priced = { items: pendingOrder.items, amount: pendingOrder.amount };
        expect(store.executeOrder(pendingOrder.orderId, T0 + 1, priced)).toEqual({
            error: expect.stringContaining('is pending'),
        });

        const rejectedOrder = issue(store, 'call-2');
        store.rejectOrder(rejectedOrder.orderId, T0 + 1, 'user rejected');
        expect(store.executeOrder(rejectedOrder.orderId, T0 + 2, priced)).toEqual({
            error: expect.stringContaining('is rejected'),
        });
        expect(
            store.getOrder(pendingOrder.orderId)?.audit.some((e) => e.event === 'executed'),
        ).toBe(false);
    });
});

describe('实时计价 helper priceOrderItems（裁决①）', () => {
    it('amount = Σ unitPrice × quantity，条目级 unitPrice / title 落记录', () => {
        const priced = priceOrderItems(PRODUCTS, [
            { productId: 'p1', quantity: 2 },
            { productId: 'p2', quantity: 3 },
        ]);
        expect(priced).toEqual({
            items: [
                { productId: 'p1', title: '商品一', quantity: 2, unitPrice: 100 },
                { productId: 'p2', title: '商品二', quantity: 3, unitPrice: 10 },
            ],
            amount: 230,
        });
    });

    it('条目 id 在快照中不存在 → { error }（执行前拒绝，不产生任何副作用）', () => {
        expect(priceOrderItems(PRODUCTS, [{ productId: 'ghost', quantity: 1 }])).toEqual({
            error: 'product not found: ghost',
        });
    });
});
