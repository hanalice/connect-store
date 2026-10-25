import styles from './OrderResultCard.module.scss';

/** placeOrder 执行回执（server 契约：成功三字段；error 回执由 registry 先行分流）。 */
export interface OrderResult {
    orderId: string;
    orderNumber: string;
    amount: number;
}

/**
 * 订单执行结果卡（registry：tool-placeOrder 输出分支，G3.3）：
 * 审批通过后的下单回执展示（订单号 / 金额 / 单号）。纯展示，审批交互归 ChatPanel 的审批卡。
 */
export function OrderResultCard({ result }: { result: OrderResult }) {
    return (
        <div className={styles.card} data-testid="order-result-card">
            <p className={styles.title}>✓ 订单已提交</p>
            <p className={styles.line}>订单号：{result.orderNumber}</p>
            <p className={styles.line}>实付金额：${result.amount.toFixed(2)}</p>
            <p className={styles.orderId}>单号 {result.orderId}</p>
        </div>
    );
}
