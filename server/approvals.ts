// HITL 审批策略层（ADR D9 分层之业务侧 + 协议策略回调）：
// - SDK toolApproval 回调（chat.ts 挂进 streamText）：placeOrder 恒 'user-approval'
//   （未配置 APPROVAL_SECRET 时 denied，裁决⑤「宁可不可用，不可无签名放行」）；
// - 签发时刻表（裁决④）：toolCallId → IssuanceRecord，首次返回 'user-approval' 时写入；
//   复放时（SDK 重估策略回调）按 TTL 判 approved / denied('approval expired')（API-AI-05）；
// - 金额阈值分级（裁决③，默认 $50，env 可调）：官方同构分支 amount > threshold →
//   'user-approval' / ≤ → undefined（机制在 server 单测以临时可逆假工具验证，不进生产注册表）。
//
// TTL = 300,000ms（5 min），与 ttl-approval-experiment.md 实测口径逐字一致（可调常量，不进 env）。
// now 可注入（仿 A9 注入时钟模式），vitest 假时钟推进，禁止真实 sleep。

import type { ToolApprovalStatus } from 'ai';
import { productsSnapshot, type Product } from './data/products.js';
import { DEFAULT_APPROVAL_AMOUNT_THRESHOLD, env } from './env.js';
import { orderStore, priceOrderItems, type OrderRecord, type OrderStore } from './orders.js';
import { placeOrderInputSchema } from './tools/placeOrder.js';

/** TTL 300,000ms（5 min），对齐 G0.4 实测口径（注释标注可调；不进 env，裁决④）。 */
export const APPROVAL_TTL_MS = 300_000;

/** 签发时刻表记录（裁决④）。 */
export interface IssuanceRecord {
    orderId: string;
    issuedAt: number;
    expiresAt: number;
}

/** 策略回调入参的窄化结构（对齐 SDK GenericToolApprovalFunction 的参数超集，裁决②类型核对）。 */
export interface ToolApprovalOptions {
    toolCall: { toolCallId: string; toolName: string; input: unknown };
    tools: unknown;
    toolsContext: unknown;
    runtimeContext: unknown;
    messages: unknown[];
}

export interface ApprovalPolicyDeps {
    /** 注入时钟（缺省 Date.now）。 */
    now?: () => number;
    /** TTL 毫秒（缺省 APPROVAL_TTL_MS = 300,000）。 */
    ttlMs?: number;
    /** 金额阈值（缺省 50，env APPROVAL_AMOUNT_THRESHOLD 可调，裁决③）。 */
    threshold?: number;
    /** APPROVAL_SECRET：未配置（undefined / 空串）时 placeOrder 策略恒 denied（裁决⑤）。 */
    approvalSecret?: string;
    /** 订单表（缺省生产单例；测试注入隔离实例）。 */
    orderStore?: OrderStore;
    /** 计价数据源（缺省 productsSnapshot；测试注入小夹具做实时计价变更场景）。 */
    products?: Product[];
}

export interface ApprovalPolicy {
    /** SDK toolApproval 回调（streamText 挂载点，裁决②）；本实现同步返回。 */
    toolApproval(options: ToolApprovalOptions): ToolApprovalStatus;
    /** 签发时刻表访问口（测试 / 运维核对）。 */
    getIssuance(toolCallId: string): IssuanceRecord | undefined;
    /** 按 orderId 查订单（惰性过期，API-AI-04）。 */
    queryOrder(orderId: string): OrderRecord | undefined;
}

/** 官方同构阈值分级的 amount 提取：input 含数值 amount 字段才参与分级。 */
function extractAmount(input: unknown): number | undefined {
    if (typeof input === 'object' && input !== null && 'amount' in input) {
        const amount = (input as { amount: unknown }).amount;
        return typeof amount === 'number' && Number.isFinite(amount) ? amount : undefined;
    }
    return undefined;
}

export function createApprovalPolicy(deps: ApprovalPolicyDeps = {}): ApprovalPolicy {
    const now = deps.now ?? Date.now;
    const ttlMs = deps.ttlMs ?? APPROVAL_TTL_MS;
    const threshold = deps.threshold ?? DEFAULT_APPROVAL_AMOUNT_THRESHOLD;
    const secret =
        deps.approvalSecret !== undefined && deps.approvalSecret.length > 0
            ? deps.approvalSecret
            : undefined;
    const store = deps.orderStore ?? orderStore;
    const products = deps.products ?? productsSnapshot;
    /** 签发时刻表：toolCallId → IssuanceRecord（内存 Map，裁决④）。 */
    const issuance = new Map<string, IssuanceRecord>();

    /** 首次签发：写 IssuanceRecord + 创建 pending 订单（条目按快照现价计价落单）。 */
    function issue(toolCall: ToolApprovalOptions['toolCall']): ToolApprovalStatus {
        if (secret === undefined) {
            // 裁决⑤：缺 APPROVAL_SECRET = 安全失败 —— 工具不执行、不进入无签名放行路径。
            return { type: 'denied', reason: 'approval service not configured' };
        }
        const parsed = placeOrderInputSchema.safeParse(toolCall.input);
        if (!parsed.success) {
            return { type: 'denied', reason: 'invalid placeOrder input' };
        }
        const priced = priceOrderItems(products, parsed.data.items);
        if ('error' in priced) {
            return { type: 'denied', reason: priced.error };
        }
        // edit 语义后端投影（裁决⑥）：新单签发 = 用户修改后重新发起 →
        // 旧 pending 单标记 rejected（detail 注明用户修改），新单 pending；curl 走通即验收。
        for (const pending of store.listPendingOrders()) {
            store.rejectOrder(
                pending.orderId,
                now(),
                `superseded by user edit; re-initiated as new order (${toolCall.toolCallId})`,
            );
        }
        const record = store.issueOrder({
            toolCallId: toolCall.toolCallId,
            items: priced.items,
            amount: priced.amount,
            ttlMs,
        });
        issuance.set(toolCall.toolCallId, {
            orderId: record.orderId,
            issuedAt: record.issuedAt,
            expiresAt: record.expiresAt,
        });
        return 'user-approval';
    }

    /** 复放判定（SDK 重估策略回调）：未过期 → approved；过期 → denied('approval expired')。 */
    function replay(record: IssuanceRecord): ToolApprovalStatus {
        const at = now();
        if (at > record.expiresAt) {
            store.expireOrder(record.orderId, at);
            return { type: 'denied', reason: 'approval expired' };
        }
        store.approveOrder(record.orderId, at);
        return { type: 'approved' };
    }

    return {
        toolApproval({ toolCall }) {
            if (toolCall.toolName === 'placeOrder') {
                const record = issuance.get(toolCall.toolCallId);
                return record === undefined ? issue(toolCall) : replay(record);
            }
            // 阈值分级（裁决③）：官方同构 amount > threshold → 'user-approval' / ≤ → undefined。
            const amount = extractAmount(toolCall.input);
            if (amount !== undefined) {
                return amount > threshold ? 'user-approval' : undefined;
            }
            return undefined;
        },
        getIssuance: (toolCallId) => issuance.get(toolCallId),
        queryOrder: (orderId) => store.queryOrder(orderId, now()),
    };
}

/** 生产策略单例（chat.ts 挂进 streamText；签发时刻表与订单表同为模块级共享状态，
 *  跨 /api/chat 请求存活 —— 复放请求是新一次 streamText 调用，表必须在请求外共享）。 */
export const approvalPolicy = createApprovalPolicy({
    approvalSecret: env.approvalSecret,
    threshold: env.approvalAmountThreshold,
    orderStore,
    products: productsSnapshot,
});
