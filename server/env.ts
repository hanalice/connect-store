import 'dotenv/config';
import { toolRegistry } from './tools/index.js';

const DEFAULT_PORT = 8787;

/** 从环境变量读取端口，缺省时使用 BFF 开发端口。 */
function readPort(value: string | undefined): number {
    return value === undefined ? DEFAULT_PORT : Number(value);
}

/**
 * 解析 TOOLS_DIRECT_ALLOW（dev 工具直调白名单，防 HITL 绕过）：
 * 逗号分隔 → trim → 去空串 → 与工具注册表 key 取交集（注册表外的名字被忽略）。
 * 缺省 / 空串 = 白名单为空 = 任何工具都不可直调，这就是正式生产语义（无 HITL 绕过面）。
 * 安全约束：审批门控工具（未来 placeOrder，G3.2）永远不得加入该白名单——
 * 它能走到这里的前提是先注册进 toolRegistry，G3.2 施工时不得把 placeOrder 注册成可直调。
 */
function parseToolsDirectAllow(value: string | undefined): string[] {
    if (value === undefined) {
        return [];
    }
    const registryKeys = new Set(Object.keys(toolRegistry));
    return value
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0 && registryKeys.has(name));
}

export const env = {
    llmApiKey: process.env.LLM_API_KEY,
    llmBaseUrl: process.env.LLM_BASE_URL,
    llmModel: process.env.LLM_MODEL,
    approvalSecret: process.env.APPROVAL_SECRET,
    port: readPort(process.env.PORT),
    toolsDirectAllow: parseToolsDirectAllow(process.env.TOOLS_DIRECT_ALLOW),
    llmConfigured: Boolean(
        process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL,
    ),
} as const;
