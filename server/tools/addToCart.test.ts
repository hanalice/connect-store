import { describe, expect, it } from 'vitest';
import { productsSnapshot } from '../data/products.js';
import { addToCartInputSchema, addToCartTool } from './addToCart.js';

/** 直调工具 execute 的最小执行选项（与 dev 直调端点同一口径；Context = Record<string, unknown>）。 */
const EXECUTE_OPTIONS = { toolCallId: 'test-call', messages: [], context: {} };

describe('addToCartInputSchema · 非法入参', () => {
    it('quantity=0 时 safeParse 失败且 issue 指向 quantity（正整数约束）', () => {
        const result = addToCartInputSchema.safeParse({ productId: 'p1', quantity: 0 });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toEqual(['quantity']);
        }
    });

    it('quantity 非整数时失败', () => {
        const result = addToCartInputSchema.safeParse({ productId: 'p1', quantity: 1.5 });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toEqual(['quantity']);
        }
    });

    it('缺 productId 时失败且 issue 指向 productId', () => {
        const result = addToCartInputSchema.safeParse({ quantity: 1 });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toEqual(['productId']);
        }
    });
});

describe('addToCartTool.execute（回执语义，不写购物车落点）', () => {
    it('合法入参返回 { productId, quantity, product } 回执', async () => {
        const [first] = productsSnapshot;
        if (first === undefined) {
            throw new Error('快照为空，测试前提不成立');
        }
        const output = await addToCartTool.execute(
            { productId: first.id, quantity: 2 },
            EXECUTE_OPTIONS,
        );
        expect(output).toEqual({ productId: first.id, quantity: 2, product: first });
    });

    it('不存在的 productId 返回明确错误', async () => {
        const output = await addToCartTool.execute(
            { productId: 'no-such-id', quantity: 1 },
            EXECUTE_OPTIONS,
        );
        expect(output).toEqual({ error: 'product not found: no-such-id' });
    });
});
