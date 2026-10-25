// env 单测（G3.2，裁决⑦ + 裁决③）：白名单互斥代码级检查（placeOrder 入白名单也被剔除）、
// APPROVAL_AMOUNT_THRESHOLD 解析（缺省 50 / 自定义 / 非法回退）。
// 只测纯函数（parseToolsDirectAllow / readApprovalAmountThreshold），不依赖进程 env。

import { describe, expect, it } from 'vitest';
import {
    APPROVAL_GATED,
    DEFAULT_APPROVAL_AMOUNT_THRESHOLD,
    parseToolsDirectAllow,
    readApprovalAmountThreshold,
} from './env.js';

describe('裁决⑦ 白名单互斥代码级检查（A7 注释级约束升级为验收项）', () => {
    it('APPROVAL_GATED 黑名单含 placeOrder', () => {
        expect(APPROVAL_GATED).toContain('placeOrder');
    });

    it('白名单仅写 placeOrder → 交集后被剔除，输出为空（直调端点恒 404）', () => {
        expect(parseToolsDirectAllow('placeOrder')).toEqual([]);
    });

    it('白名单混入 placeOrder 与其它合法工具 → 仅保留非门控工具', () => {
        expect(parseToolsDirectAllow('placeOrder,searchCatalog,addToCart')).toEqual([
            'searchCatalog',
            'addToCart',
        ]);
    });

    it('正常白名单不受影响；缺省 / 空串 = 空白名单（生产语义）', () => {
        expect(parseToolsDirectAllow('searchCatalog,getProductDetails,addToCart')).toEqual([
            'searchCatalog',
            'getProductDetails',
            'addToCart',
        ]);
        expect(parseToolsDirectAllow(undefined)).toEqual([]);
        expect(parseToolsDirectAllow('')).toEqual([]);
        expect(parseToolsDirectAllow('  ,  ')).toEqual([]);
    });
});

describe('APPROVAL_AMOUNT_THRESHOLD 解析（裁决③）', () => {
    it('缺省 / 空串 → 50（PM 拍板默认值）', () => {
        expect(DEFAULT_APPROVAL_AMOUNT_THRESHOLD).toBe(50);
        expect(readApprovalAmountThreshold(undefined)).toBe(50);
        expect(readApprovalAmountThreshold('')).toBe(50);
        expect(readApprovalAmountThreshold('   ')).toBe(50);
    });

    it('自定义合法值生效（含 0 与小数）', () => {
        expect(readApprovalAmountThreshold('120')).toBe(120);
        expect(readApprovalAmountThreshold('0')).toBe(0);
        expect(readApprovalAmountThreshold('49.99')).toBe(49.99);
    });

    it('非法值（非数字 / 负数 / Infinity）回退缺省 50', () => {
        expect(readApprovalAmountThreshold('abc')).toBe(50);
        expect(readApprovalAmountThreshold('-1')).toBe(50);
        expect(readApprovalAmountThreshold('Infinity')).toBe(50);
    });
});
