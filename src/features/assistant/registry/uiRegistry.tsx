import type { ReactNode } from 'react';
import { z } from 'zod';

import { EmptyState } from '../../catalog/components/EmptyState';
import { ProductCard } from '../../catalog/components/ProductCard';
import { ProductGrid } from '../../catalog/components/ProductGrid';
import type { Product } from '../../catalog/types/product';
import { ApprovalCard } from '../components/ApprovalCard';
import { PriceBreakdown } from '../components/PriceBreakdown';
import { ToolError } from '../components/ToolError';
import styles from './uiRegistry.module.scss';

/**
 * registry 分发输入（裁决⑦）：从消息 toolCalls（ToolCallInfo）解耦取
 * `{ toolName, output, error? }`——渲染数据源与 G2.3 一致 = 消息 toolCalls，不读 machine 日志。
 */
export interface ToolCallOutput {
    toolName: string;
    output?: unknown;
    error?: string;
}

/** 未注册 toolName（含 dynamic tool call）的降级文案（裁决⑤：绝不渲染任意组件）。 */
export const FALLBACK_TEXT = '暂不支持展示该工具的结果';

/** schema 校验失败时的内联错误指示文案（UT-REG-03：不静默渲染坏数据）。 */
const INVALID_TITLE = '输出格式校验失败';
const INVALID_MESSAGE = '已拒绝渲染无效的工具输出';

// —— zod schema（裁决⑤：输出入 registry 前必须运行时校验；镜像存量 Product 契约）——

const pricingOptionSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const productSchema = z.object({
    id: z.string(),
    creator: z.string(),
    title: z.string(),
    pricingOption: pricingOptionSchema,
    imagePath: z.string(),
    price: z.number(),
});

const searchCatalogOutputSchema = z.object({
    items: z.array(productSchema),
    total: z.number(),
});

const getProductDetailsOutputSchema = z.object({
    product: productSchema,
});

/** 工具输出体内的业务错误（server 契约：错误 = 输出体内 error 字段，不走 HTTP 错误码）。 */
function outputErrorMessage(output: unknown): string | undefined {
    if (typeof output === 'object' && output !== null && 'error' in output) {
        const error = (output as { error: unknown }).error;
        return typeof error === 'string' ? error : undefined;
    }
    return undefined;
}

/**
 * 渲染决策注册表（design §7 白名单安全边界）：key = 官方 `tool-${toolName}` 命名。
 * value 是「渲染决策」而非单个组件——一个 key 按命中 / 空结果 / 失败分流到不同组件。
 */
export const UI_REGISTRY: Record<string, (call: ToolCallOutput) => ReactNode> = {
    'tool-searchCatalog': (call) => {
        if (call.error !== undefined) return <ToolError message={call.error} />;
        const businessError = outputErrorMessage(call.output);
        if (businessError !== undefined) return <ToolError message={businessError} />;
        const parsed = searchCatalogOutputSchema.safeParse(call.output);
        if (!parsed.success) {
            return <ToolError title={INVALID_TITLE} message={INVALID_MESSAGE} />;
        }
        if (parsed.data.items.length === 0) return <EmptyState />;
        const items: Product[] = parsed.data.items;
        return (
            <div className={styles.toolGrid} data-testid="tool-search-catalog-grid">
                <ProductGrid>
                    {items.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </ProductGrid>
            </div>
        );
    },
    'tool-getProductDetails': (call) => {
        if (call.error !== undefined) return <ToolError message={call.error} />;
        const businessError = outputErrorMessage(call.output);
        if (businessError !== undefined) return <ToolError message={businessError} />;
        const parsed = getProductDetailsOutputSchema.safeParse(call.output);
        if (!parsed.success) {
            return <ToolError title={INVALID_TITLE} message={INVALID_MESSAGE} />;
        }
        return <PriceBreakdown product={parsed.data.product} />;
    },
    // placeOrder 工具物理不存在，key 先占位防协议漂移；G2.4 仅静态占位（裁决④）
    'tool-placeOrder': () => <ApprovalCard />,
};
