import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../../catalog/types/product';
import { useAssistantStore } from '../state/useAssistantStore';
import type { ChatMessage, ToolCallInfo } from '../types/assistant';
import { ChatPanel } from './ChatPanel';

const productA: Product = {
    id: 'p1',
    creator: 'Creator A',
    title: '免费素材 Alpha',
    pricingOption: 1,
    imagePath: '',
    price: 0,
};

const productB: Product = {
    id: 'p2',
    creator: 'Creator B',
    title: '付费模板 Beta',
    pricingOption: 0,
    imagePath: '',
    price: 12.5,
};

function callWith(toolCallId: string, toolName: string, output: unknown): ToolCallInfo {
    return { toolCallId, toolName, input: {}, output, startedAt: 1, endedAt: 2 };
}

function assistantMessage(id: string, toolCalls: ToolCallInfo[]): ChatMessage {
    return { id, role: 'assistant', text: '回复正文', reasoning: '', toolCalls };
}

describe('ChatPanel Generative UI 集成', () => {
    beforeEach(() => {
        useAssistantStore.getState().reset();
    });

    it('INT-AI-04 消息挂 toolCalls 经 ChatPanel 渲染：命中 → 气泡内联 ProductGrid + ProductCard；空结果 → EmptyState；未注册 → fallback 文本', () => {
        useAssistantStore.setState({
            status: 'done',
            messages: [
                { id: 'user-1', role: 'user', text: '推荐素材', reasoning: '' },
                assistantMessage('a-1', [
                    callWith('c-1', 'searchCatalog', {
                        items: [productA, productB],
                        total: 2,
                    }),
                ]),
                assistantMessage('a-2', [
                    callWith('c-2', 'searchCatalog', { items: [], total: 0 }),
                ]),
                assistantMessage('a-3', [callWith('c-3', 'deleteAccount', { deleted: true })]),
            ],
        });

        render(<ChatPanel />);

        // 命中：气泡内联真实 ProductCard（标题 / aria-label 结构）；composer 的
        // 「发送」按钮在消息列表外，卡片计数须在 log 作用域内断言
        const log = screen.getByRole('log', { name: '对话消息列表' });
        expect(screen.getByText('免费素材 Alpha')).toBeInTheDocument();
        expect(screen.getByText('付费模板 Beta')).toBeInTheDocument();
        expect(within(log).getAllByRole('article')).toHaveLength(2);
        expect(
            within(log).getByRole('article', {
                name: '免费素材 Alpha by Creator A, price Free',
            }),
        ).toBeInTheDocument();

        // 空结果 → 存量 EmptyState
        expect(screen.getByText('No contents matched your current criteria.')).toBeInTheDocument();

        // 未注册 toolName → fallback 文本（无对应卡片）
        expect(screen.getByText('暂不支持展示该工具的结果')).toBeInTheDocument();

        // 过程归 ToolCallPanel（裁决③）：三张工具过程卡仍在
        expect(screen.getAllByText('searchCatalog')).toHaveLength(2);
        expect(screen.getByText('deleteAccount')).toBeInTheDocument();
        // 最终文字照常渲染（对话流不中断）
        expect(screen.getAllByText('回复正文')).toHaveLength(3);
    });
});
