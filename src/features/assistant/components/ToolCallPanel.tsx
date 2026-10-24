import type { ToolCallInfo } from '../types/assistant';
import styles from './ToolCallPanel.module.scss';

/** 结果摘要截断长度（裁决④：只展示摘要，不做商品卡 / 网格 / 空态）。 */
const SUMMARY_MAX_CHARS = 160;

type ToolCallStatus = 'running' | 'success' | 'error';

function formatJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2) ?? '';
    } catch {
        return String(value);
    }
}

function truncate(text: string): string {
    return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS)}…` : text;
}

function statusOf(call: ToolCallInfo): ToolCallStatus {
    if (call.error !== undefined) return 'error';
    if (call.endedAt !== undefined) return 'success';
    return 'running';
}

/** 工具调用可视化（design §7）：工具名 / 格式化参数 / 三态 / 耗时（未结束不显示）。 */
export function ToolCallPanel({ toolCalls }: { toolCalls: ToolCallInfo[] }) {
    if (toolCalls.length === 0) return null;
    return (
        <div className={styles.panel}>
            {toolCalls.map((call) => {
                const status = statusOf(call);
                const durationMs =
                    call.endedAt === undefined ? null : Math.round(call.endedAt - call.startedAt);
                return (
                    <div key={call.toolCallId} className={styles.toolCard} data-state={status}>
                        <div className={styles.header}>
                            <span className={styles.toolName}>{call.toolName}</span>
                            <span className={`${styles.status} ${styles[status]}`}>
                                {status === 'running' ? (
                                    <>
                                        <span className={styles.spinner} aria-hidden="true" />
                                        执行中
                                    </>
                                ) : status === 'success' ? (
                                    '成功'
                                ) : (
                                    '失败'
                                )}
                            </span>
                            {durationMs !== null ? (
                                <span className={styles.duration}>{durationMs} ms</span>
                            ) : null}
                        </div>
                        <pre className={styles.args}>
                            <code>{truncate(formatJson(call.input))}</code>
                        </pre>
                        {status === 'success' && call.output !== undefined ? (
                            <pre className={styles.result}>
                                <code>{truncate(formatJson(call.output))}</code>
                            </pre>
                        ) : null}
                        {status === 'error' ? (
                            <p className={styles.errorText}>{truncate(call.error ?? '未知错误')}</p>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
