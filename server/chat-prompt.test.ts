// chat-prompt 单测（G3.3b，裁决②）：edit 重发 prompt 硬约束存在性 + 防误触发半句在位
// + 存量审批约束零弱化。只测 CHAT_SYSTEM_PROMPT 常量文本，不依赖进程 env
// （server 域本 G 允许改动 = chat-prompt.ts 一处 + 本测试）。

import { describe, expect, it } from 'vitest';

import { CHAT_SYSTEM_PROMPT } from './chat-prompt.js';

describe('G3.3b 裁决②：edit 重发 prompt 硬约束（ADR D11 方案 B 四护栏之一）', () => {
    it('「订单修改重发」标记触发句在位：严格按清单调用 placeOrder、会再次进入审批、不要反问不要增减数量', () => {
        expect(CHAT_SYSTEM_PROMPT).toContain(
            '当用户消息以「订单修改重发」开头并给出明确商品清单与数量时，严格按清单调用 placeOrder 提交（会再次进入审批），不要反问、不要增减数量',
        );
    });

    it('防误触发半句在位：普通闲聊中提到商品名或数字不构成下单意图', () => {
        expect(CHAT_SYSTEM_PROMPT).toContain('普通闲聊中提到商品名或数字不构成下单意图');
    });

    it('存量约束零弱化：placeOrder 必经审批表述原样保留', () => {
        expect(CHAT_SYSTEM_PROMPT).toContain('所有订单都必须经过用户确认，不存在免审批路径');
    });

    it('H2 热修（PM 追认条款）：placeOrder 两个时刻分述在位——已执行报结果、挂起才说等待确认', () => {
        expect(CHAT_SYSTEM_PROMPT).toContain('工具返回执行结果（含订单号）');
        expect(CHAT_SYSTEM_PROMPT).toContain('工具挂起未返回结果（等待界面审批）');
        expect(CHAT_SYSTEM_PROMPT).toContain('不要说「等待确认」');
    });
});

describe('G5.1 购物车 single-writer 条款（方向 D，裁决①-b）', () => {
    it('clearCart 工具条款在位：被用户要求清空时直接调用 + 调用后告知已清空', () => {
        expect(CHAT_SYSTEM_PROMPT).toContain(
            'clearCart：低副作用（可逆），被用户要求清空购物车时直接调用，不需要再向用户确认；调用后告知用户购物车已清空',
        );
    });

    it('single-writer 总纲在位：购物车由 AI 全权经手，不引导用户去界面手动操作', () => {
        expect(CHAT_SYSTEM_PROMPT).toContain('购物车由你全权经手');
        expect(CHAT_SYSTEM_PROMPT).toContain('不要引导用户去界面手动操作');
    });
});
