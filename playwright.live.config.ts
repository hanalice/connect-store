import { defineConfig, devices } from '@playwright/test';

/**
 * live 冒烟专用：真打 BFF + 上游 LLM，不进默认门禁（慢 / 费 / 偶发失败）。
 * 前置：npm run dev:bff（8787 真实 BFF 在线）。
 * 手动触发：npm run test:e2e:live
 */
export default defineConfig({
    testDir: 'e2e',
    testMatch: '**/*.e2e.ts',
    grep: /@live/,
    workers: 1,
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:5173',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 60_000,
    },
});
