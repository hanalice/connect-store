import { describe, expect, it } from 'vitest';

import { filterProducts, sortProducts, type CatalogQueryState } from './catalogSelectors';
import { PricingOption, type Product } from '../types/product';

const PRODUCTS: Product[] = [
    {
        id: 'p1',
        creator: 'Adam',
        title: 'Yellow Coat',
        pricingOption: PricingOption.PAID,
        imagePath: '',
        price: 50,
    },
    {
        id: 'p2',
        creator: 'Anisha',
        title: 'Black Heels',
        pricingOption: PricingOption.FREE,
        imagePath: '',
        price: 0,
    },
    {
        id: 'p3',
        creator: 'Zoe',
        title: 'Alpha Bag',
        pricingOption: PricingOption.VIEW_ONLY,
        imagePath: '',
        price: 0,
    },
    {
        id: 'p4',
        creator: 'Adam',
        title: 'Blue Shirt',
        pricingOption: PricingOption.PAID,
        imagePath: '',
        price: 30,
    },
];

describe('catalog selectors', () => {
    describe('filterProducts', () => {
        it('filters by keyword matching title or creator', () => {
            const query: CatalogQueryState = {
                keyword: 'adam',
                pricingOptions: [],
                sortMode: 'default',
            };
            const result = filterProducts(PRODUCTS, query);
            expect(result).toHaveLength(2); // p1 and p4
            expect(result.every((p) => p.creator === 'Adam')).toBe(true);
        });

        it('filters by multiple pricing options', () => {
            const query: CatalogQueryState = {
                keyword: '',
                pricingOptions: [PricingOption.FREE, PricingOption.VIEW_ONLY],
                sortMode: 'default',
            };
            const result = filterProducts(PRODUCTS, query);
            expect(result).toHaveLength(2); // p2 and p3
        });

        it('handles combined filter and search', () => {
            const query: CatalogQueryState = {
                keyword: 'coat',
                pricingOptions: [PricingOption.PAID],
                sortMode: 'default',
            };
            const result = filterProducts(PRODUCTS, query);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('p1');
        });
    });

    describe('sortProducts', () => {
        it('sorts by default (title A-Z)', () => {
            const result = sortProducts(PRODUCTS, 'default');
            expect(result[0].title).toBe('Alpha Bag');
            expect(result[result.length - 1].title).toBe('Yellow Coat');
        });

        it('sorts by Higher Price (Paid > Free > View Only, price DESC within Paid)', () => {
            const result = sortProducts(PRODUCTS, 'price-desc');

            // Categories: Paid, then Free, then View Only
            expect(result[0].pricingOption).toBe(PricingOption.PAID);
            expect(result[1].pricingOption).toBe(PricingOption.PAID);
            expect(result[2].pricingOption).toBe(PricingOption.FREE);
            expect(result[3].pricingOption).toBe(PricingOption.VIEW_ONLY);

            // Within Paid: 50 before 30
            expect(result[0].price).toBe(50);
            expect(result[1].price).toBe(30);
        });

        it('sorts by Lower Price (View Only > Free > Paid, price ASC within Paid)', () => {
            const result = sortProducts(PRODUCTS, 'price-asc');

            // Categories: View Only, then Free, then Paid
            expect(result[0].pricingOption).toBe(PricingOption.VIEW_ONLY);
            expect(result[1].pricingOption).toBe(PricingOption.FREE);
            expect(result[2].pricingOption).toBe(PricingOption.PAID);
            expect(result[3].pricingOption).toBe(PricingOption.PAID);

            // Within Paid: 30 before 50
            expect(result[2].price).toBe(30);
            expect(result[3].price).toBe(50);
        });

        it('falls back to title A-Z for items with same category and same price', () => {
            const samePricePaid = [
                { ...PRODUCTS[0], id: 'z1', title: 'Zebra' },
                { ...PRODUCTS[0], id: 'a1', title: 'Ant' },
            ];
            const result = sortProducts(samePricePaid, 'price-desc');
            expect(result[0].title).toBe('Ant');
            expect(result[1].title).toBe('Zebra');
        });
    });
});
