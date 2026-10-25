// placeOrder：下单工具（第 4 工具，A7 注册表唯一一份）。
// 副作用级别「高（不可逆）」→ 恒 'user-approval' HITL 审批（design §4 / 裁决③），
// 不存在「≤ 阈值自动执行」生产路径 —— 本 Showcase 不下放任何不可逆副作用。
//
// 安全边界：
// - API-AI-01：execute 前必须已在订单表内审批通过（approved）且未过 TTL；
//   未审批 / pending / rejected / expired 一律返回输出体 { error }（沿用工具错误契约，不抛 HTTP 错）。
// - 裁决①：金额不以请求体或前端持久化快照为准，执行时按 server 快照现价实时重计价
//   （amount = Σ unitPrice × quantity），条目级 unitPrice 落订单记录，金额写回审计。
// - A7 互斥（裁决⑦）：注册进 toolRegistry（chat 工具回路自动带上）但永不可 dev 直调
//   （env.ts APPROVAL_GATED 黑名单代码级剔除，即使 TOOLS_DIRECT_ALLOW 显式写入也 404）。

import { tool } from 'ai';
import { z } from 'zod';
import { orderStore, priceOrderItems, type OrderStore } from '../orders.js';
import { productsSnapshot, type Product } from '../data/products.js';

export const placeOrderInputSchema = z.object({
    cartId: z
        .string()
        .optional()
        .describe('购物车 id（占位字段；实际以下单条目 items 为准重计价）'),
    items: z
        .array(
            z.object({
                productId: z.string().describe('商品 id（快照内唯一）'),
                quantity: z.number().int().positive().describe('购买数量，正整数'),
            }),
        )
        .min(1)
        .describe('下单条目；金额由 server 按商品快照现价实时计价，不信任请求体携带的价格'),
});

export type PlaceOrderInput = z.infer<typeof placeOrderInputSchema>;

export type PlaceOrderOutput =
    | { orderId: string; orderNumber: string; amount: number }
    | { error: string };

export interface PlaceOrderToolDeps {
    orderStore?: OrderStore;
    products?: Product[];
    now?: () => number;
}

export function createPlaceOrderTool(deps: PlaceOrderToolDeps = {}) {
    const store = deps.orderStore ?? orderStore;
    const products = deps.products ?? productsSnapshot;
    const now = deps.now ?? Date.now;

    return tool({
        description:
            '提交订单（不可逆副作用，恒需用户审批后才会执行）。金额按 server 商品快照现价实时计价，' +
            '不信任任何请求体或前端持久化的价格。返回 { orderId, orderNumber, amount } 或 { error }。',
        inputSchema: placeOrderInputSchema,
        execute: (input, options): PlaceOrderOutput => {
            const order = store.findOrderByToolCallId(options.toolCallId);
            if (order === undefined) {
                return { error: `no issued order for tool call ${options.toolCallId}` };
            }
            if (order.status !== 'approved') {
                // API-AI-01：未审批 / pending / rejected / expired 一律拦截，执行 0 次。
                return { error: `order ${order.orderId} is ${order.status}` };
            }
            const priced = priceOrderItems(products, input.items);
            if ('error' in priced) {
                return { error: priced.error };
            }
            const executed = store.executeOrder(order.orderId, now(), priced);
            if ('error' in executed) {
                return { error: executed.error };
            }
            return {
                orderId: order.orderId,
                orderNumber: executed.orderNumber,
                amount: priced.amount,
            };
        },
    });
}

export const placeOrderTool = createPlaceOrderTool();
