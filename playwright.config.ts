import { defineConfig, devices } from '@playwright/test';

/**
 * 默认 E2E 门禁配置：全部走确定性 mock SSE 流（e2e/mock-bff.mjs，8787 端口）。
 * live 冒烟（@live 标签）不在此运行，见 playwright.live.config.ts。
 */
export default defineConfig({
    testDir: 'e2e',
    // 用 .e2e.ts 后缀避开 vitest 默认 include（*.spec.ts 会被 npm test 收编）
    testMatch: '**/*.e2e.ts',
    grepInvert: /@live/,
    workers: 1,
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: [
        {
            command: 'npm run dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
        },
        {
            command: 'node e2e/mock-bff.mjs',
            // 与 mock-bff.mjs 的 E2E_MOCK_PORT 同源（默认 8787），env 覆盖时端口探测保持一致
            port: Number(process.env.E2E_MOCK_PORT ?? 8787),
            // 被占用（真实 BFF 在跑）时直接报错，绝不静默复用，保证 mock 确定性
            reuseExistingServer: false,
        },
    ],
});
