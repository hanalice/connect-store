// addToCart：加购工具（副作用级别「低（可逆）」→ 自动执行 + UI 反馈，design §4，无 HITL）。
// 边界（G2.1 工单拍板）：本 G 只做到「工具定义 + schema 校验 + 返回回执」——
// execute 校验 productId 存在于快照、quantity 合法，返回 { productId, quantity, product } 回执；
// 不写任何购物车状态落点（购物车 store 接线属 G3.1，副作用落点随购物车切片一起交付）。

import { tool } from 'ai';
import { z } from 'zod';
import { findProductById, productsSnapshot, type Product } from '../data/products.js';

export const addToCartInputSchema = z.object({
    productId: z.string().describe('商品 id（快照内唯一）'),
    quantity: z.number().int().positive().describe('加购数量，正整数'),
});

export type AddToCartOutput =
    | { productId: string; quantity: number; product: Product }
    | { error: string };

export const addToCartTool = tool({
    description: '把商品加入购物车（回执语义：校验商品存在与数量合法后返回回执）。',
    inputSchema: addToCartInputSchema,
    execute: ({ productId, quantity }): AddToCartOutput => {
        const product = findProductById(productsSnapshot, productId);
        if (product === undefined) {
            return { error: `product not found: ${productId}` };
        }
        return { productId, quantity, product };
    },
});
