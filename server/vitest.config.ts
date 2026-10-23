// server 侧 vitest 最小配置：存在意义 = 阻断 vitest 向上查找到根 vite.config.ts
// （根配置带 jsdom / setupFiles / exclude: ['server/**']，直接污染 server 测试运行）。
// Node 环境为默认，无 jsdom / setup 需求。
import { defineConfig } from 'vitest/config';

export default defineConfig({});
