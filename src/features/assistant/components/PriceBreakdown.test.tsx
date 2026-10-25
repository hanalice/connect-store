import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Product } from '../../catalog/types/product';
import { PriceBreakdown } from './PriceBreakdown';

const paidProduct: Product = {
    id: 'p1',
    creator: 'Creator A',
    title: '付费模板 Beta',
    pricingOption: 0,
    imagePath: '',
    price: 12.5,
};

describe('PriceBreakdown', () => {
    it('Paid 商品：计价方式 / 单价 / 合计拆分项，金额口径与存量一致（$ + 两位小数）', () => {
        render(<PriceBreakdown product={paidProduct} />);

        expect(screen.getByText('付费模板 Beta')).toBeInTheDocument();
        expect(screen.getByText('计价方式')).toBeInTheDocument();
        expect(screen.getByText('单价')).toBeInTheDocument();
        expect(screen.getByText('合计')).toBeInTheDocument();
        expect(screen.getByText('Paid')).toBeInTheDocument();
        expect(screen.getAllByText('$12.50')).toHaveLength(2);
    });

    it('Free 商品：金额位显示 PRICING_LABEL 枚举标签而非 $', () => {
        render(<PriceBreakdown product={{ ...paidProduct, pricingOption: 1, price: 0 }} />);

        // 计价方式 / 单价 / 合计三处均为枚举标签
        expect(screen.getAllByText('Free')).toHaveLength(3);
        expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    });
});
