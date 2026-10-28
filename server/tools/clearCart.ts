// clearCart：清空购物车工具（G5.1 裁决①-b，single-writer 收口；副作用级别「低（可逆）」
// → 自动执行 + UI 反馈，design §4，无 HITL）。回执语义与 addToCart 同模式（G2.1 边界）：
// execute 零入参，返回 { cleared: true } 回执；不写任何购物车状态落点——
// 购物车 store 接线在前端 useAssistantStore 的 tool-output-available 分支（镜像 G3.1 addToCart）。
// 零入参刻意用空对象 schema：模型侧无参数工具调用恒传 {}，宽松剥离未知键
// （清空无业务参数可错，与 addToCart 的精确字段校验不是一回事）。

import { tool } from 'ai';
import { z } from 'zod';

export const clearCartInputSchema = z.object({});

export type ClearCartOutput = { cleared: true };

export const clearCartTool = tool({
    description: '清空购物车（回执语义：清空当前购物车全部条目并返回回执）。',
    inputSchema: clearCartInputSchema,
    execute: (): ClearCartOutput => {
        return { cleared: true };
    },
});
