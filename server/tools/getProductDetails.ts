// getProductDetails：按 id 查商品详情（只读、无 HITL，design §4）。
// 未命中返回明确错误字段，不静默返回 null（避免 LLM 误以为调用成功）。

import { tool } from 'ai';
import { z } from 'zod';
import { findProductById, productsSnapshot, type Product } from '../data/products.js';

export const getProductDetailsInputSchema = z.object({
    id: z.string().describe('商品 id（快照内唯一）'),
});

export type GetProductDetailsOutput = { product: Product } | { error: string };

export const getProductDetailsTool = tool({
    description: '按 id 获取商品详情；id 不存在时返回 error 字段说明未命中。',
    inputSchema: getProductDetailsInputSchema,
    execute: ({ id }): GetProductDetailsOutput => {
        const product = findProductById(productsSnapshot, id);
        if (product === undefined) {
            return { error: `product not found: ${id}` };
        }
        return { product };
    },
});
