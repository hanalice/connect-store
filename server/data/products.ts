// 数据层（ADR D10）：加载冻结快照 server/data/products.json（一次性导出，随仓库提交，
// 运行时不直连远程、不加缓存层），在快照上真实执行过滤 / 排序 / 价格区间过滤
// （数据 mock、逻辑真跑）。
//
// 检索能力边界（诚实声明，design §1.3）：query 仅对 title / creator 做子串匹配，
// 无同义词扩展、无向量召回；风格/场景类需求由 LLM 做 query understanding 后多轮调用工具。
//
// 过滤 / 排序语义与存量前端 src/features/catalog/selectors/catalogSelectors.ts 同口径：
// - query：trim + lowercase 后对 title / creator 子串匹配（OR 关系）；
// - pricingOption：精确匹配（存量前端是数组 IN，BFF 侧工具入参是单值，语义为其特例）；
// - 排序三模式复刻 sortProducts（default = title A-Z；price-desc = PAID 优先组内价格降序；
//   price-asc = VIEW_ONLY 优先组内价格升序；平局 fallback title A-Z）。
// BFF 侧新增能力（存量前端没有）：maxPrice / minPrice 对 price 做闭区间
// [minPrice, maxPrice] 过滤，与其余条件 AND 组合。

import rawProducts from './products.json' with { type: 'json' };

export const PricingOption = {
    PAID: 0,
    FREE: 1,
    VIEW_ONLY: 2,
} as const;

export type PricingOption = (typeof PricingOption)[keyof typeof PricingOption];

/** 与前端 src/features/catalog/types/product.ts 的 Product 同形状（server 独立包，本地定义）。 */
export interface Product {
    id: string;
    creator: string;
    title: string;
    pricingOption: PricingOption;
    imagePath: string;
    price: number;
}

export type SortMode = 'default' | 'price-desc' | 'price-asc';

// 快照在导出脚本（scripts/export-products.mjs）中已逐条校验字段形状且无重复 id，
// 这里只做类型断言（pricingOption: number → 0/1/2 字面量联合）。
export const productsSnapshot: Product[] = rawProducts as Product[];

export interface CatalogFilter {
    query?: string;
    pricingOption?: PricingOption;
    maxPrice?: number;
    minPrice?: number;
}

/** 过滤（数据源以参数注入，测试可用小夹具）：query 子串 AND pricingOption AND 价格闭区间。 */
export function filterProducts(products: Product[], filter: CatalogFilter): Product[] {
    const normalizedQuery = filter.query?.trim().toLowerCase() ?? '';

    return products.filter((product) => {
        const matchesQuery =
            normalizedQuery.length === 0 ||
            product.title.toLowerCase().includes(normalizedQuery) ||
            product.creator.toLowerCase().includes(normalizedQuery);

        const matchesPricingOption =
            filter.pricingOption === undefined || product.pricingOption === filter.pricingOption;

        const matchesMinPrice = filter.minPrice === undefined || product.price >= filter.minPrice;
        const matchesMaxPrice = filter.maxPrice === undefined || product.price <= filter.maxPrice;

        return matchesQuery && matchesPricingOption && matchesMinPrice && matchesMaxPrice;
    });
}

/** 排序：复刻存量 sortProducts 三模式语义，平局 fallback title A-Z。 */
export function sortProducts(products: Product[], sortMode: SortMode): Product[] {
    const list = [...products];

    switch (sortMode) {
        case 'price-desc':
            return list.sort((a, b) => {
                // 优先级：PAID (0) > FREE (1) > VIEW_ONLY (2)
                if (a.pricingOption !== b.pricingOption) {
                    return a.pricingOption - b.pricingOption;
                }
                // PAID 组内按价格降序
                if (a.pricingOption === PricingOption.PAID && b.price !== a.price) {
                    return b.price - a.price;
                }
                return a.title.localeCompare(b.title);
            });

        case 'price-asc':
            return list.sort((a, b) => {
                // 优先级：VIEW_ONLY (2) > FREE (1) > PAID (0)
                if (a.pricingOption !== b.pricingOption) {
                    return b.pricingOption - a.pricingOption;
                }
                // PAID 组内按价格升序
                if (a.pricingOption === PricingOption.PAID && a.price !== b.price) {
                    return a.price - b.price;
                }
                return a.title.localeCompare(b.title);
            });

        case 'default':
        default:
            return list.sort((a, b) => a.title.localeCompare(b.title));
    }
}

/** 按 id 查找（快照导出时已保证 id 唯一）；未命中返回 undefined，由调用方转成明确错误。 */
export function findProductById(products: Product[], id: string): Product | undefined {
    return products.find((product) => product.id === id);
}
