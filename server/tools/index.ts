// 工具注册表（全项目唯一一份）：dev 直调端点（POST /api/tools/:toolName）与未来
// /api/chat 工具回路（G2.3）共用，避免两份定义漂移。
// 约定：注册表内所有工具的 inputSchema 均为 Zod schema，execute 同步返回 JSON 可序列化结果。

import { addToCartTool } from './addToCart.js';
import { getProductDetailsTool } from './getProductDetails.js';
import { placeOrderTool } from './placeOrder.js';
import { searchCatalogTool } from './searchCatalog.js';

export const toolRegistry = {
    searchCatalog: searchCatalogTool,
    getProductDetails: getProductDetailsTool,
    addToCart: addToCartTool,
    placeOrder: placeOrderTool,
} as const;

export type ToolName = keyof typeof toolRegistry;
