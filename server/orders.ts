// 订单表（业务状态层，ADR D9）：pending / approved / rejected / expired 四态
//（状态枚举锁定，无 edited）+ issuedAt / expiresAt + 审计日志 + 惰性过期。
// design 口径：内存 Map（重启即失，不接数据库）；执行产出 mock 订单号，不做真实支付/落库。
//
// 惰性过期（design §6.3 判定点②）：查询（queryOrder）时若 pending 且已超 TTL，
// 落 expired 并记审计后返回 —— 前端按 orderId 查询即得恢复状态（API-AI-04）。

import { randomBytes } from 'node:crypto';
import { findProductById, type Product } from './data/products.js';

export type { Product } from './data/products.js';

/** 订单四态（锁定枚举）：无 edited —— edit 语义 = 旧单 rejected + 新单 pending（裁决⑥）。 */
export type OrderStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type AuditEvent = 'issued' | 'approved' | 'rejected' | 'expired' | 'executed';

export interface AuditEntry {
    ts: number;
    event: AuditEvent;
    detail?: string;
}

export interface OrderItem {
    productId: string;
    title: string;
    quantity: number;
    unitPrice: number;
}

export interface OrderRecord {
    orderId: string;
    toolCallId: string;
    items: OrderItem[];
    amount: number;
    status: OrderStatus;
    issuedAt: number;
    expiresAt: number;
    decidedAt?: number;
    audit: AuditEntry[];
}

/** 实时计价（裁决①）：金额唯一以 server 快照现价为准（amount = Σ unitPrice × quantity），
 *  条目级 unitPrice 取快照价并落入订单记录；不以请求体 / 前端持久化快照金额为准。
 *  条目 id 在快照中不存在 → 拒绝执行并返回 error。数据源以参数注入，测试可用小夹具。 */
export function priceOrderItems(
    products: Product[],
    items: { productId: string; quantity: number }[],
): { items: OrderItem[]; amount: number } | { error: string } {
    const priced: OrderItem[] = [];
    for (const item of items) {
        const product = findProductById(products, item.productId);
        if (product === undefined) {
            return { error: `product not found: ${item.productId}` };
        }
        priced.push({
            productId: product.id,
            title: product.title,
            quantity: item.quantity,
            unitPrice: product.price,
        });
    }
    const amount = priced.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);
    return { items: priced, amount };
}

export type ExecuteOrderResult = { ok: true; orderNumber: string } | { error: string };

export interface IssueOrderArgs {
    toolCallId: string;
    items: OrderItem[];
    amount: number;
    ttlMs: number;
}

export interface OrderStore {
    /** 签发：创建 pending 订单（审计 issued）。orderId 由表内生成。 */
    issueOrder(args: IssueOrderArgs): OrderRecord;
    /** 按 orderId 查原始记录（不过期、不变更状态）。未知 → undefined。 */
    getOrder(orderId: string): OrderRecord | undefined;
    /** 按 orderId 查询（API-AI-04）：惰性过期 —— pending 超 TTL 即落 expired + 审计。 */
    queryOrder(orderId: string, now: number): OrderRecord | undefined;
    /** placeOrder 执行入口按 toolCallId 找回订单（API-AI-01 拦截的查询面）。 */
    findOrderByToolCallId(toolCallId: string): OrderRecord | undefined;
    /** 当前所有 pending 订单（edit 语义后端投影：新单签发时取代旧 pending 单）。 */
    listPendingOrders(): OrderRecord[];
    /** pending → approved（仅 pending 可流转，其余返回 undefined）。 */
    approveOrder(orderId: string, now: number): OrderRecord | undefined;
    /** pending → rejected（仅 pending 可流转；detail 记录拒绝原因/用户修改说明）。 */
    rejectOrder(orderId: string, now: number, detail?: string): OrderRecord | undefined;
    /** pending → expired（惰性过期与 TTL 判定的落盘点）。 */
    expireOrder(orderId: string, now: number): OrderRecord | undefined;
    /** 执行入口：仅 approved 且未过 TTL 可执行 → 生成 mock 订单号（order- 前缀 + 随机后缀），
     *  审计 executed（含执行时刻实时计价金额），状态维持 approved（四态锁定）。
     *  其余状态 / 已过 TTL 一律 { error }，订单不产生任何副作用。 */
    executeOrder(
        orderId: string,
        now: number,
        priced: { items: OrderItem[]; amount: number },
    ): ExecuteOrderResult;
}

let orderSeq = 0;

/** 订单表工厂：注入时钟（仿 A9 注入时钟模式，vitest 假时钟推进，禁止真实 sleep）。 */
export function createOrderStore(deps: { now: () => number }): OrderStore {
    const orders = new Map<string, OrderRecord>();

    function transition(
        record: OrderRecord,
        event: AuditEvent,
        now: number,
        detail?: string,
    ): void {
        record.audit.push({ ts: now, event, detail });
    }

    return {
        issueOrder({ toolCallId, items, amount, ttlMs }) {
            const issuedAt = deps.now();
            const record: OrderRecord = {
                orderId: `ord-${randomBytes(4).toString('hex')}-${(orderSeq++).toString(36)}`,
                toolCallId,
                items,
                amount,
                status: 'pending',
                issuedAt,
                expiresAt: issuedAt + ttlMs,
                audit: [],
            };
            transition(record, 'issued', issuedAt, `items=${items.length} amount=${amount}`);
            orders.set(record.orderId, record);
            return record;
        },

        getOrder(orderId) {
            return orders.get(orderId);
        },

        queryOrder(orderId, now) {
            const record = orders.get(orderId);
            if (record === undefined) return undefined;
            if (record.status === 'pending' && now > record.expiresAt) {
                record.status = 'expired';
                record.decidedAt = now;
                transition(record, 'expired', now, 'approval expired (ttl) on query');
            }
            return record;
        },

        findOrderByToolCallId(toolCallId) {
            for (const record of orders.values()) {
                if (record.toolCallId === toolCallId) return record;
            }
            return undefined;
        },

        listPendingOrders() {
            return Array.from(orders.values()).filter((record) => record.status === 'pending');
        },

        approveOrder(orderId, now) {
            const record = orders.get(orderId);
            if (record === undefined || record.status !== 'pending') return undefined;
            record.status = 'approved';
            record.decidedAt = now;
            transition(record, 'approved', now);
            return record;
        },

        rejectOrder(orderId, now, detail) {
            const record = orders.get(orderId);
            if (record === undefined || record.status !== 'pending') return undefined;
            record.status = 'rejected';
            record.decidedAt = now;
            transition(record, 'rejected', now, detail);
            return record;
        },

        expireOrder(orderId, now) {
            const record = orders.get(orderId);
            if (record === undefined || record.status !== 'pending') return undefined;
            record.status = 'expired';
            record.decidedAt = now;
            transition(record, 'expired', now, 'approval expired (ttl)');
            return record;
        },

        executeOrder(orderId, now, priced) {
            const record = orders.get(orderId);
            if (record === undefined) return { error: `order not found: ${orderId}` };
            if (record.status !== 'approved') {
                return { error: `order ${orderId} is ${record.status}` };
            }
            if (now > record.expiresAt) {
                record.status = 'expired';
                record.decidedAt = now;
                transition(record, 'expired', now, 'approval expired (ttl) on execute');
                return { error: `order ${orderId} approval expired` };
            }
            const orderNumber = `order-${randomBytes(4).toString('hex')}`;
            record.items = priced.items;
            record.amount = priced.amount;
            transition(
                record,
                'executed',
                now,
                JSON.stringify({ orderNumber, amount: priced.amount }),
            );
            return { ok: true, orderNumber };
        },
    };
}

/** 生产单例（design 口径：BFF 内存订单表，重启即失）。 */
export const orderStore = createOrderStore({ now: Date.now });
