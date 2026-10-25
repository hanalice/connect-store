import styles from './ToolError.module.scss';

interface ToolErrorProps {
    /** 错误详情文案（工具自身 error 信息或校验失败说明）。 */
    message: string;
    /** 卡片标题：工具执行失败（默认）/ 输出格式校验失败 等场景可覆写。 */
    title?: string;
}

/**
 * 工具结果富渲染的错误卡（registry 分支组件）。刻意不用 role="alert"——错误横幅的
 * alert 语义属于 ChatPanel 错误态，此处渲染在气泡内，避免干扰 E2E 的 alert 计数断言。
 */
export function ToolError({ message, title = '工具执行失败' }: ToolErrorProps) {
    return (
        <div className={styles.toolError}>
            <span className={styles.title}>{title}</span>
            <span className={styles.message}>{message}</span>
        </div>
    );
}
