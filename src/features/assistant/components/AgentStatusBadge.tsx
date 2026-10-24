import type { AssistantState } from '../state/assistantMachine';
import styles from './AgentStatusBadge.module.scss';

type BadgeTone = 'idle' | 'busy' | 'tool' | 'ok' | 'bad';

interface StateProjection {
    label: string;
    tone: BadgeTone;
}

/** 9 态静态投影（裁决②/③）：await_human 本 G 不可达，映射先行定义，交互验证留 G3.3。 */
const STATE_PROJECTION: Record<AssistantState, StateProjection> = {
    idle: { label: '待命', tone: 'idle' },
    thinking: { label: '思考中', tone: 'busy' },
    tool_calling: { label: '调用工具', tone: 'tool' },
    tool_result: { label: '工具结果', tone: 'tool' },
    streaming: { label: '生成回复', tone: 'busy' },
    await_human: { label: '等待确认', tone: 'tool' },
    done: { label: '已完成', tone: 'ok' },
    error: { label: '出错', tone: 'bad' },
    aborted: { label: '已停止', tone: 'idle' },
};

/** 状态机投影徽标：role="status"（禁止 role="alert"，否则破坏 E2E alert 计数断言）。 */
export function AgentStatusBadge({ status }: { status: AssistantState }) {
    const projection = STATE_PROJECTION[status];
    return (
        <div
            className={`${styles.badge} ${styles[projection.tone]}`}
            role="status"
            aria-live="polite"
            aria-label="助手状态"
        >
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.label}>{projection.label}</span>
        </div>
    );
}
