import styles from './StreamingText.module.scss';

interface StreamingTextProps {
    /** 截至当前的 text-delta 累积结果（由 store 提供，组件不做本地缓冲）。 */
    text: string;
    /** 流是否仍在进行：仅控制光标显示，不做任何定时器。 */
    streaming: boolean;
}

/**
 * 流式正文渲染：props 一到即渲染（真流式）。
 * 明确禁止 setInterval / setTimeout 人工打字机——那会掩盖 TTFT，属于假流式。
 */
export function StreamingText({ text, streaming }: StreamingTextProps) {
    return (
        <div className={styles.streamingText} aria-live="polite">
            {text}
            {streaming ? <span className={styles.cursor} aria-hidden="true" /> : null}
        </div>
    );
}
