import styles from './ReasoningBlock.module.scss';

interface ReasoningBlockProps {
    /** 截至当前的 reasoning-delta 累积结果。 */
    reasoning: string;
    /** 流是否仍在进行（仅用于标题省略号提示）。 */
    streaming?: boolean;
}

/** 推理内容折叠区：默认收起（原生 details 不带 open），无 reasoning 内容时不渲染。 */
export function ReasoningBlock({ reasoning, streaming = false }: ReasoningBlockProps) {
    if (!reasoning) {
        return null;
    }

    return (
        <details className={styles.reasoningBlock}>
            <summary className={styles.summary}>思考过程{streaming ? '…' : ''}</summary>
            <div className={styles.content}>{reasoning}</div>
        </details>
    );
}
