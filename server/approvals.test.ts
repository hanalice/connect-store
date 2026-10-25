// 审批策略单测（G3.2，裁决③④⑤⑥）：签发时刻表、复放 TTL 判定（API-AI-05，
// 假时钟 300,000/300,001ms 双边界）、缺密钥安全失败、金额阈值分级（可逆假工具）、
// edit 语义后端投影。注入时钟 / 数据源 / 订单表（A9 模式），互不污染。

import { describe, expect, it } from 'vitest';
import { APPROVAL_TTL_MS, createApprovalPolicy, type ToolApprovalOptions } from './approvals.js';
import { createOrderStore, priceOrderItems, type Product } from './orders.js';

const T0 = 1_000_000;
const SECRET = 'approvals-test-secret-0123456789abcd';

function makeProducts(): Product[] {
    return [
        {
            id: 'p1',
            creator: 'c1',
            title: '商品一',
            pricingOption: 0,
            imagePath: '/p1.png',
            price: 100,
        },
        {
            id: 'p2',
            creator: 'c2',
            title: '商品二',
            pricingOption: 1,
            imagePath: '/p2.png',
            price: 10,
        },
    ];
}

function makeWorld(overrides: { secret?: string; threshold?: number } = {}) {
    let t = T0;
    const products = makeProducts();
    const store = createOrderStore({ now: () => t });
    const policy = createApprovalPolicy({
        now: () => t,
        ttlMs: APPROVAL_TTL_MS,
        threshold: overrides.threshold ?? 50,
        approvalSecret: overrides.secret ?? SECRET,
        orderStore: store,
        products,
    });
    const options = (
        toolCallId: string,
        input: unknown,
        toolName = 'placeOrder',
    ): ToolApprovalOptions => ({
        toolCall: { toolCallId, toolName, input },
        tools: undefined,
        toolsContext: undefined,
        runtimeContext: undefined,
        messages: [],
    });
    const placeOrderInput = { items: [{ productId: 'p1', quantity: 2 }] };
    return { policy, store, products, options, placeOrderInput, tick: (ms: number) => (t += ms) };
}

describe('审批策略 · 签发时刻表（裁决④）', () => {
    it('首签：placeOrder 恒 user-approval，issuance 表写入，pending 订单按快照价创建', async () => {
        const { policy, store, options, placeOrderInput } = makeWorld();
        const decision = await policy.toolApproval(options('call-1', placeOrderInput));
        expect(decision).toBe('user-approval');

        const issuance = policy.getIssuance('call-1');
        expect(issuance).toEqual({
            orderId: expect.stringMatching(/^ord-/),
            issuedAt: T0,
            expiresAt: T0 + APPROVAL_TTL_MS,
        });
        const order = store.getOrder(issuance!.orderId);
        expect(order?.status).toBe('pending');
        expect(order?.amount).toBe(200); // 100 × 2，服务端快照计价
        expect(order?.items[0]).toMatchObject({ productId: 'p1', unitPrice: 100 });
    });

    it('复放未过期：{ type: approved }，订单流转 approved', async () => {
        const { policy, store, options, placeOrderInput } = makeWorld();
        await policy.toolApproval(options('call-1', placeOrderInput));
        const orderId = policy.getIssuance('call-1')!.orderId;

        const decision = await policy.toolApproval(options('call-1', placeOrderInput));
        expect(decision).toEqual({ type: 'approved' });
        expect(store.getOrder(orderId)?.status).toBe('approved');
    });

    it('API-AI-05 复放过期：假时钟推进 300,001ms → denied(approval expired)，订单落 expired', async () => {
        const { policy, store, options, placeOrderInput, tick } = makeWorld();
        await policy.toolApproval(options('call-1', placeOrderInput));
        const orderId = policy.getIssuance('call-1')!.orderId;

        tick(APPROVAL_TTL_MS + 1);
        const decision = await policy.toolApproval(options('call-1', placeOrderInput));
        expect(decision).toEqual({ type: 'denied', reason: 'approval expired' });
        expect(store.getOrder(orderId)?.status).toBe('expired');
        expect(store.getOrder(orderId)?.audit.map((e) => e.event)).toEqual(['issued', 'expired']);
    });

    it('TTL 恰好 300,000ms：边界值通过（now > expiresAt 才过期）', async () => {
        const { policy, options, placeOrderInput, tick } = makeWorld();
        await policy.toolApproval(options('call-1', placeOrderInput));
        tick(APPROVAL_TTL_MS);
        const decision = await policy.toolApproval(options('call-1', placeOrderInput));
        expect(decision).toEqual({ type: 'approved' });
    });

    it('缺 APPROVAL_SECRET（裁决⑤）：策略恒 denied(approval service not configured)，无订单无签发', async () => {
        const { policy, store, options, placeOrderInput } = makeWorld({ secret: '' });
        const decision = await policy.toolApproval(options('call-1', placeOrderInput));
        expect(decision).toEqual({ type: 'denied', reason: 'approval service not configured' });
        expect(policy.getIssuance('call-1')).toBeUndefined();
        expect(store.listPendingOrders()).toHaveLength(0);
    });

    it('签发前入参即校验：非法 input / 快照外 productId → denied，不创建订单', async () => {
        const { policy, store, options } = makeWorld();
        expect(await policy.toolApproval(options('call-bad', { items: 'nope' }))).toEqual({
            type: 'denied',
            reason: 'invalid placeOrder input',
        });
        expect(
            await policy.toolApproval(
                options('call-ghost', { items: [{ productId: 'ghost', quantity: 1 }] }),
            ),
        ).toEqual({
            type: 'denied',
            reason: 'product not found: ghost',
        });
        expect(store.listPendingOrders()).toHaveLength(0);
    });
});

describe('裁决③ 金额阈值分级（可逆假工具，官方同构分支）', () => {
    it('input.amount > 阈值 → user-approval；≤ 阈值 → undefined（自动放行分支机制真实可运行）', async () => {
        const { policy, options } = makeWorld({ threshold: 50 });
        // 假工具 refund 仅存在于本测试（不进生产注册表）。
        expect(await policy.toolApproval(options('r1', { amount: 80 }, 'refund'))).toBe(
            'user-approval',
        );
        expect(await policy.toolApproval(options('r2', { amount: 50 }, 'refund'))).toBeUndefined();
        expect(await policy.toolApproval(options('r3', { amount: 1 }, 'refund'))).toBeUndefined();
    });

    it('自定义阈值生效（threshold=10）：amount 11 需审批、10 放行', async () => {
        const { policy, options } = makeWorld({ threshold: 10 });
        expect(await policy.toolApproval(options('r1', { amount: 11 }, 'refund'))).toBe(
            'user-approval',
        );
        expect(await policy.toolApproval(options('r2', { amount: 10 }, 'refund'))).toBeUndefined();
    });

    it('无 amount 字段的工具调用 → undefined（不参与分级）', async () => {
        const { policy, options } = makeWorld();
        expect(
            await policy.toolApproval(options('x1', { items: [] }, 'searchCatalog')),
        ).toBeUndefined();
        expect(
            await policy.toolApproval(options('x2', { amount: 'oops' }, 'refund')),
        ).toBeUndefined();
    });
});

describe('裁决⑥ edit 语义后端投影', () => {
    it('新单签发时旧 pending 单标记 rejected（detail 注明用户修改），新单 pending', async () => {
        const { policy, store, options, placeOrderInput } = makeWorld();
        await policy.toolApproval(options('call-1', placeOrderInput));
        const oldOrderId = policy.getIssuance('call-1')!.orderId;

        // 用户 edit：修改数量后重新发起 → 新 toolCall 触发签发。
        const modifiedInput = { items: [{ productId: 'p1', quantity: 5 }] };
        const decision = await policy.toolApproval(options('call-2', modifiedInput));
        expect(decision).toBe('user-approval');

        const oldOrder = store.getOrder(oldOrderId);
        expect(oldOrder?.status).toBe('rejected');
        expect(oldOrder?.audit.find((e) => e.event === 'rejected')?.detail).toContain(
            'superseded by user edit',
        );

        const newOrderId = policy.getIssuance('call-2')!.orderId;
        expect(newOrderId).not.toBe(oldOrderId);
        expect(store.getOrder(newOrderId)?.status).toBe('pending');
        expect(store.getOrder(newOrderId)?.amount).toBe(500);
    });
});

describe('实时计价数据源（裁决①支撑）', () => {
    it('签发后快照价变更：执行时刻以新价重计（见 placeOrder 单测端到端断言）', () => {
        const { products, store } = makeWorld();
        const before = priceOrderItems(products, [{ productId: 'p1', quantity: 1 }]);
        expect(before).toMatchObject({ amount: 100 });
        products[0]!.price = 120; // 模拟快照价变更
        const after = priceOrderItems(products, [{ productId: 'p1', quantity: 1 }]);
        expect(after).toMatchObject({ amount: 120 });
        expect(store).toBeDefined();
    });
});
