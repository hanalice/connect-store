import type { ReactNode } from 'react';

import { RegistryErrorBoundary } from '../components/RegistryErrorBoundary';
import { ToolOutputCard } from '../components/ToolOutputCard';
import type { ToolCallOutput } from './uiRegistry';

/**
 * 白名单分发：已注册 key → 决策函数；未注册 key（含 dynamic tool call）→ 纯文本
 * fallback（裁决⑤）。渲染包两层防护——ToolOutputCard 在边界内调用决策函数（其同步
 * 抛错可被捕获），React 渲染期抛错由 ErrorBoundary 兜底（UT-REG-04：本地化 fallback，
 * 对话流不中断）。
 */
export function renderToolOutput(call: ToolCallOutput): ReactNode {
    return (
        <RegistryErrorBoundary>
            <ToolOutputCard call={call} />
        </RegistryErrorBoundary>
    );
}
