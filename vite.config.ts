import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                // 与 e2e/mock-bff.mjs 的 E2E_MOCK_PORT 同源（默认 8787）：
                // 非标准端口 harness 下数据面代理必须跟随，否则 /api 502（G4.1 Q-D-01）
                target: `http://localhost:${process.env.E2E_MOCK_PORT ?? 8787}`,
                changeOrigin: true,
            },
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test/setupTests.ts',
        css: true,
        // server/ 是独立 package 的 BFF，有自己的 vitest（server/npm test）；
        // 不排除的话根 vitest 默认 include 会扫到 server/**/*.test.ts，打破根测试基线。
        exclude: [...configDefaults.exclude, 'server/**'],
    },
});
