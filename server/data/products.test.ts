import { describe, expect, it } from 'vitest';
import { filterProducts, findProductById, sortProducts, type Product } from './products.js';

// 小夹具（不读全量快照）：覆盖三种 pricingOption、大小写、credit 边界价格。
const fixture: Product[] = [
    {
        id: 'p1',
        creator: 'Alice',
        title: 'Cyberpunk City',
        pricingOption: 0,
        imagePath: 'a.png',
        price: 15,
    },
    {
        id: 'p2',
        creator: 'bob',
        title: 'Forest Pack',
        pricingOption: 1,
        imagePath: 'b.png',
        price: 0,
    },
    {
        id: 'p3',
        creator: 'Carol',
        title: 'Ocean View',
        pricingOption: 2,
        imagePath: 'c.png',
        price: 0,
    },
    {
        id: 'p4',
        creator: 'Cyber Alice',
        title: 'Neon Grid',
        pricingOption: 0,
        imagePath: 'd.png',
        price: 20,
    },
    {
        id: 'p5',
        creator: 'Dave',
        title: 'cyber deck',
        pricingOption: 0,
        imagePath: 'e.png',
        price: 25,
    },
];

const ids = (products: Product[]) => products.map((p) => p.id);

describe('filterProducts · query 子串（title / creator，大小写不敏感，trim）', () => {
    it('按 title 子串命中', () => {
        expect(ids(filterProducts(fixture, { query: 'neon' }))).toEqual(['p4']);
    });

    it('按 creator 子串命中且大小写不敏感', () => {
        expect(ids(filterProducts(fixture, { query: 'ALICE' })).sort()).toEqual(['p1', 'p4']);
    });

    it('query 前后空白被 trim', () => {
        expect(ids(filterProducts(fixture, { query: '  neon  ' }))).toEqual(['p4']);
    });

    it('query 缺省或全空白时不过滤', () => {
        expect(filterProducts(fixture, {})).toHaveLength(5);
        expect(filterProducts(fixture, { query: '   ' })).toHaveLength(5);
    });
});

describe('filterProducts · pricingOption 精确匹配', () => {
    it('pricingOption=0 只命中 Paid', () => {
        expect(ids(filterProducts(fixture, { pricingOption: 0 })).sort()).toEqual([
            'p1',
            'p4',
            'p5',
        ]);
    });
});

describe('filterProducts · maxPrice / minPrice 闭区间', () => {
    it('price 恰等于 maxPrice 应命中（闭区间上界）', () => {
        expect(ids(filterProducts(fixture, { maxPrice: 20 })).sort()).toEqual([
            'p1',
            'p2',
            'p3',
            'p4',
        ]);
    });

    it('price 恰等于 minPrice 应命中（闭区间下界）', () => {
        expect(ids(filterProducts(fixture, { minPrice: 20 })).sort()).toEqual(['p4', 'p5']);
    });

    it('区间组合 [15, 20]', () => {
        expect(ids(filterProducts(fixture, { minPrice: 15, maxPrice: 20 })).sort()).toEqual([
            'p1',
            'p4',
        ]);
    });
});

describe('filterProducts · 多条件 AND 组合', () => {
    it('query AND pricingOption AND maxPrice', () => {
        // 'cyber' 命中 p1(title)/p4(creator)/p5(title)，再 AND pricingOption=0（全过）与 maxPrice=20（p5 被排除）
        expect(
            ids(filterProducts(fixture, { query: 'cyber', pricingOption: 0, maxPrice: 20 })).sort(),
        ).toEqual(['p1', 'p4']);
    });

    it('无命中返回空数组', () => {
        expect(filterProducts(fixture, { query: 'zzzz-no-match' })).toEqual([]);
    });
});

describe('sortProducts · 三模式（与存量 catalogSelectors 同口径）', () => {
    it('default = title A-Z', () => {
        // localeCompare 口径：空格先于字母，故 'cyber deck'(p5) 排在 'Cyberpunk City'(p1) 之前
        expect(ids(sortProducts(fixture, 'default'))).toEqual(['p5', 'p1', 'p2', 'p4', 'p3']);
    });

    it('price-desc = PAID 优先、组内价格降序、平局 fallback title A-Z', () => {
        // PAID 组：p5(25) > p4(20) > p1(15)；随后 FREE(p2)、VIEW_ONLY(p3) 按组序
        expect(ids(sortProducts(fixture, 'price-desc'))).toEqual(['p5', 'p4', 'p1', 'p2', 'p3']);
    });

    it('price-asc = VIEW_ONLY 优先、PAID 组内价格升序', () => {
        // VIEW_ONLY(p3) 优先，FREE(p2) 次之，PAID 组内 15 < 20 < 25
        expect(ids(sortProducts(fixture, 'price-asc'))).toEqual(['p3', 'p2', 'p1', 'p4', 'p5']);
    });

    it('同价平局 fallback title A-Z', () => {
        const ties: Product[] = [
            {
                id: 't1',
                creator: 'x',
                title: 'Beta',
                pricingOption: 0,
                imagePath: 'i.png',
                price: 10,
            },
            {
                id: 't2',
                creator: 'y',
                title: 'Alpha',
                pricingOption: 0,
                imagePath: 'j.png',
                price: 10,
            },
        ];
        expect(ids(sortProducts(ties, 'price-desc'))).toEqual(['t2', 't1']);
    });
});

describe('findProductById', () => {
    it('命中返回该商品，未命中返回 undefined', () => {
        expect(findProductById(fixture, 'p2')?.title).toBe('Forest Pack');
        expect(findProductById(fixture, 'nope')).toBeUndefined();
    });
});
