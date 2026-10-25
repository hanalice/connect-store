import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ToolError } from './ToolError';

describe('ToolError', () => {
    it('渲染错误卡：标题 + 详情文案，且不带 role="alert"（不干扰错误横幅计数）', () => {
        const { container } = render(<ToolError message="catalog snapshot unavailable" />);

        expect(screen.getByText('工具执行失败')).toBeInTheDocument();
        expect(screen.getByText('catalog snapshot unavailable')).toBeInTheDocument();
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('title 可覆写（schema 校验失败场景复用）', () => {
        render(<ToolError title="输出格式校验失败" message="已拒绝渲染无效的工具输出" />);
        expect(screen.getByText('输出格式校验失败')).toBeInTheDocument();
    });
});
