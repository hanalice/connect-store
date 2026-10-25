import { FALLBACK_TEXT, UI_REGISTRY, type ToolCallOutput } from '../registry/uiRegistry';
import styles from '../registry/uiRegistry.module.scss';

/** 单个工具输出的白名单分发卡：已注册 key → 决策函数；未注册 → 纯文本 fallback。 */
export function ToolOutputCard({ call }: { call: ToolCallOutput }) {
    // 官方 tool-${toolName} 命名分发（design §7）：输入是 ToolCallInfo 的裸 toolName
    const decision = UI_REGISTRY[`tool-${call.toolName}`];
    if (decision === undefined) {
        return <p className={styles.fallback}>{FALLBACK_TEXT}</p>;
    }
    return <>{decision(call)}</>;
}
