import 'dotenv/config';

const DEFAULT_PORT = 8787;

/** 从环境变量读取端口，缺省时使用 BFF 开发端口。 */
function readPort(value: string | undefined): number {
    return value === undefined ? DEFAULT_PORT : Number(value);
}

export const env = {
    llmApiKey: process.env.LLM_API_KEY,
    llmBaseUrl: process.env.LLM_BASE_URL,
    llmModel: process.env.LLM_MODEL,
    approvalSecret: process.env.APPROVAL_SECRET,
    port: readPort(process.env.PORT),
    llmConfigured: Boolean(
        process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL,
    ),
} as const;
