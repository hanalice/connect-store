import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApprovalCard } from './ApprovalCard';

describe('ApprovalCard', () => {
    it('静态占位形态锁定：占位文案 + 禁用态按钮，无任何审批交互逻辑', () => {
        render(<ApprovalCard />);

        expect(screen.getByText('订单审批')).toBeInTheDocument();
        expect(screen.getByText('审批功能即将上线')).toBeInTheDocument();
        const button = screen.getByRole('button', { name: '确认下单（即将上线）' });
        expect(button).toBeDisabled();
    });
});
