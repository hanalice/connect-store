import styles from './ApprovalCard.module.scss';

/**
 * 订单审批卡（registry：tool-placeOrder 分支）——G2.4 仅静态占位（裁决④）：
 * 只渲染占位文案与禁用态按钮，不接审批交互、不发 machine 事件、不定义订单类型
 * （交互与类型归 G3.2 / G3.3）。
 */
export function ApprovalCard() {
    return (
        <div className={styles.card}>
            <span className={styles.title}>订单审批</span>
            <p className={styles.placeholder}>审批功能即将上线</p>
            <button type="button" className={styles.action} disabled>
                确认下单（即将上线）
            </button>
        </div>
    );
}
