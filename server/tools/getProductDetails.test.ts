import { describe, expect, it } from 'vitest';
import { productsSnapshot } from '../data/products.js';
import { getProductDetailsInputSchema, getProductDetailsTool } from './getProductDetails.js';

/** 直调工具 execute 的最小执行选项（与 dev 直调端点同一口径；Context = Record<string, unknown>）。 */
const EXECUTE_OPTIONS = { toolCallId: 'test-call', messages: [], context: {} };

describe('getProductDetailsInputSchema · 非法入参', () => {
    it('缺 id 时 safeParse 失败且 issue 指向 id', () => {
        const result = getProductDetailsInputSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toEqual(['id']);
        }
    });
});

describe('getProductDetailsTool.execute（真跑在冻结快照上）', () => {
    it('合法 id 返回该商品且 id 一致', async () => {
        const [first] = productsSnapshot;
        if (first === undefined) {
            throw new Error('快照为空，测试前提不成立');
        }
        const output = await getProductDetailsTool.execute({ id: first.id }, EXECUTE_OPTIONS);
        expect(output).toEqual({ product: first });
    });

    it('未命中 id 返回明确错误（不静默 null）', async () => {
        const output = await getProductDetailsTool.execute({ id: 'no-such-id' }, EXECUTE_OPTIONS);
        expect(output).toEqual({ error: 'product not found: no-such-id' });
    });
});
