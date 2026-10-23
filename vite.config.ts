import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8787',
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
