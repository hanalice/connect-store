import { describe, expect, it } from 'vitest';
import { productsSnapshot } from '../data/products.js';
import {
    searchCatalogInputSchema,
    searchCatalogTool,
    type SearchCatalogOutput,
} from './searchCatalog.js';

/** 直调工具 execute 的最小执行选项（与 dev 直调端点同一口径；Context = Record<string, unknown>）。 */
const EXECUTE_OPTIONS = { toolCallId: 'test-call', messages: [], context: {} };

describe('searchCatalogInputSchema · 非法入参', () => {
    it('maxPrice 为字符串时 safeParse 失败且 issue 指向 maxPrice', () => {
        const result = searchCatalogInputSchema.safeParse({ maxPrice: 'abc' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toEqual(['maxPrice']);
        }
    });

    it('pricingOption 非 0/1/2 时失败', () => {
        const result = searchCatalogInputSchema.safeParse({ pricingOption: 3 });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toEqual(['pricingOption']);
        }
    });

    it('sort 非枚举值时失败', () => {
        const result = searchCatalogInputSchema.safeParse({ sort: 'bogus' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toEqual(['sort']);
        }
    });
});

describe('searchCatalogTool.execute（真跑在冻结快照上）', () => {
    // 本 G 约定 execute 同步返回普通对象；SDK 类型联合了 AsyncIterable 形态，这里按约定收窄。
    const run = async (input: Parameters<typeof searchCatalogTool.execute>[0]) =>
        (await searchCatalogTool.execute(input, EXECUTE_OPTIONS)) as SearchCatalogOutput;

    it('空结果返回 { items: [], total: 0 }', async () => {
        const output = await run({ query: 'zzzz-definitely-no-match' });
        expect(output).toEqual({ items: [], total: 0 });
    });

    it('maxPrice=20 的全部命中项 price <= 20 且 total > 0（快照事实）', async () => {
        const output = await run({ maxPrice: 20 });
        expect(output.total).toBeGreaterThan(0);
        expect(output.items.every((item) => item.price <= 20)).toBe(true);
    });

    it('无入参时 total 等于快照总条数，默认排序 title A-Z', async () => {
        const output = await run({});
        expect(output.total).toBe(productsSnapshot.length);
        const titles = output.items.map((item) => item.title);
        expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    });
});
