// clearCart 单测（G5.1 裁决①-b）：零入参 schema（空对象，宽松剥离未知键）
// + 回执语义（execute 恒返回 { cleared: true }，不写购物车状态落点——落点在前端接线）。

import { describe, expect, it } from 'vitest';
import { clearCartInputSchema, clearCartTool } from './clearCart.js';

/** 直调工具 execute 的最小执行选项（与 dev 直调端点同一口径；Context = Record<string, unknown>）。 */
const EXECUTE_OPTIONS = { toolCallId: 'test-call', messages: [], context: {} };

describe('clearCartInputSchema · 零入参', () => {
    it('空对象通过校验（模型侧无参数工具调用恒传 {}）', () => {
        const result = clearCartInputSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('非对象入参（null / 字符串）失败', () => {
        expect(clearCartInputSchema.safeParse(null).success).toBe(false);
        expect(clearCartInputSchema.safeParse('clear').success).toBe(false);
    });
});

describe('clearCartTool.execute（回执语义，零入参，不写购物车落点）', () => {
    it('恒返回 { cleared: true } 回执（清空无业务参数可错，无 error 分支）', async () => {
        const output = await clearCartTool.execute({}, EXECUTE_OPTIONS);
        expect(output).toEqual({ cleared: true });
    });
});
