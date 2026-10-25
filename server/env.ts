import 'dotenv/config';
import { toolRegistry } from './tools/index.js';

const DEFAULT_PORT = 8787;

/** 从环境变量读取端口，缺省时使用 BFF 开发端口。 */
function readPort(value: string | undefined): number {
    return value === undefined ? DEFAULT_PORT : Number(value);
}

/** 金额阈值缺省值（裁决③：PM 拍板默认 $50；快照价格带宽 1~10000，足以演示大小额两侧）。 */
export const DEFAULT_APPROVAL_AMOUNT_THRESHOLD = 50;

/** 解析 APPROVAL_AMOUNT_THRESHOLD（裁决③）：缺省 / 空串 / 非法值一律回退缺省值。 */
export function readApprovalAmountThreshold(value: string | undefined): number {
    if (value === undefined || value.trim().length === 0) {
        return DEFAULT_APPROVAL_AMOUNT_THRESHOLD;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_APPROVAL_AMOUNT_THRESHOLD;
}

/**
 * 审批门控黑名单（裁决⑦，A7「placeOrder 永不入白名单」从注释级约束升级为代码级检查）：
 * 这些工具即使被写进 TOOLS_DIRECT_ALLOW 且在注册表内，交集结果也必须再剔除 ——
 * 审批门控工具永远不能绕过 HITL 被 dev 直调（API 级互斥，vitest + curl 双重实证）。
 */
export const APPROVAL_GATED: readonly string[] = ['placeOrder'];

/**
 * 解析 TOOLS_DIRECT_ALLOW（dev 工具直调白名单，防 HITL 绕过）：
 * 逗号分隔 → trim → 去空串 → 与工具注册表 key 取交集（注册表外的名字被忽略）
 * → 再剔除 APPROVAL_GATED 审批门控黑名单（代码级互斥，见上）。
 * 缺省 / 空串 = 白名单为空 = 任何工具都不可直调，这就是正式生产语义（无 HITL 绕过面）。
 */
export function parseToolsDirectAllow(value: string | undefined): string[] {
    if (value === undefined) {
        return [];
    }
    const registryKeys = new Set(Object.keys(toolRegistry));
    return value
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0 && registryKeys.has(name))
        .filter((name) => !APPROVAL_GATED.includes(name));
}

export const env = {
    llmApiKey: process.env.LLM_API_KEY,
    llmBaseUrl: process.env.LLM_BASE_URL,
    llmModel: process.env.LLM_MODEL,
    approvalSecret: process.env.APPROVAL_SECRET,
    approvalAmountThreshold: readApprovalAmountThreshold(process.env.APPROVAL_AMOUNT_THRESHOLD),
    port: readPort(process.env.PORT),
    toolsDirectAllow: parseToolsDirectAllow(process.env.TOOLS_DIRECT_ALLOW),
    llmConfigured: Boolean(
        process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL,
    ),
} as const;
