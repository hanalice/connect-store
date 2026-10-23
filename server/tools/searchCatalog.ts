// searchCatalog：结构化查询工具（唯一检索通道，硬约束 #4；只读、无 HITL，design §4）。
// 语义理解放模型层，精确过滤放工具层：「20 刀以内」→ { maxPrice: 20 }。

import { tool } from 'ai';
import { z } from 'zod';
import { filterProducts, productsSnapshot, sortProducts, type Product } from '../data/products.js';

export const searchCatalogInputSchema = z.object({
    query: z
        .string()
        .optional()
        .describe('关键词，对商品 title / creator 做大小写不敏感的子串匹配'),
    pricingOption: z
        .union([z.literal(0), z.literal(1), z.literal(2)])
        .optional()
        .describe('计价方式精确匹配：0=Paid，1=Free，2=View Only'),
    sort: z
        .enum(['default', 'price-desc', 'price-asc'])
        .optional()
        .describe(
            '排序：default=标题 A-Z；price-desc=付费优先价格降序；price-asc=仅查看优先价格升序',
        ),
    maxPrice: z.number().optional().describe('价格上限（闭区间，price <= maxPrice）'),
    minPrice: z.number().optional().describe('价格下限（闭区间，price >= minPrice）'),
});

export type SearchCatalogInput = z.infer<typeof searchCatalogInputSchema>;

export interface SearchCatalogOutput {
    items: Product[];
    total: number;
}

export const searchCatalogTool = tool({
    description:
        '在商品目录快照中做结构化检索：关键词（title/creator 子串）、计价方式、排序、价格区间（闭区间，可组合）。',
    inputSchema: searchCatalogInputSchema,
    execute: (input): SearchCatalogOutput => {
        const filtered = filterProducts(productsSnapshot, input);
        const items = sortProducts(filtered, input.sort ?? 'default');
        return { items, total: items.length };
    },
});
