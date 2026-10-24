import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { ToolCallInfo } from '../types/assistant';
import { ToolCallPanel } from './ToolCallPanel';

const runningCall: ToolCallInfo = {
    toolCallId: 'call-1',
    toolName: 'searchCatalog',
    input: { query: '免费素材', pricingOption: 1 },
    startedAt: 100,
};

const successCall: ToolCallInfo = {
    ...runningCall,
    output: { items: [{ id: 'p1' }], total: 1 },
    startedAt: 100,
    endedAt: 142.4,
};

const errorCall: ToolCallInfo = {
    ...runningCall,
    error: 'catalog snapshot unavailable',
    startedAt: 100,
    endedAt: 130,
};

describe('ToolCallPanel', () => {
    it('执行中：渲染工具名与格式化参数，显示 spinner 态且不显示耗时', () => {
        render(<ToolCallPanel toolCalls={[runningCall]} />);

        expect(screen.getByText('searchCatalog')).toBeInTheDocument();
        // 格式化 JSON 参数（pre/code 内文本）
        expect(screen.getByText(/"query": "免费素材"/)).toBeInTheDocument();
        expect(screen.getByText(/"pricingOption": 1/)).toBeInTheDocument();
        expect(screen.getByText('执行中')).toBeInTheDocument();
        expect(screen.queryByText(/\d+ ms/)).not.toBeInTheDocument();
        // 未结束不展示结果摘要
        expect(screen.queryByText(/"total": 1/)).not.toBeInTheDocument();
    });

    it('成功：成功标记 + 耗时（ms）+ 截断的结果摘要', () => {
        render(<ToolCallPanel toolCalls={[successCall]} />);

        expect(screen.getByText('成功')).toBeInTheDocument();
        expect(screen.getByText('42 ms')).toBeInTheDocument();
        expect(screen.getByText(/"total": 1/)).toBeInTheDocument();
        expect(screen.queryByText('执行中')).not.toBeInTheDocument();
    });

    it('失败：失败标记 + 错误文案，不展示耗时之外的成功摘要', () => {
        render(<ToolCallPanel toolCalls={[errorCall]} />);

        expect(screen.getByText('失败')).toBeInTheDocument();
        expect(screen.getByText(/catalog snapshot unavailable/)).toBeInTheDocument();
        expect(screen.queryByText('成功')).not.toBeInTheDocument();
    });

    it('空数组与多张工具卡：空不渲染，多张按序渲染', () => {
        const { container } = render(<ToolCallPanel toolCalls={[]} />);
        expect(container).toBeEmptyDOMElement();

        const secondCall = { ...successCall, toolCallId: 'call-2' };
        render(<ToolCallPanel toolCalls={[runningCall, secondCall]} />);
        expect(screen.getAllByText('searchCatalog')).toHaveLength(2);
        expect(screen.getByText('执行中')).toBeInTheDocument();
        expect(screen.getByText('成功')).toBeInTheDocument();
    });
});
