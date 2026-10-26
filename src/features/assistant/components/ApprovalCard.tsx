import { useEffect, useMemo, useState } from 'react';

import styles from './ApprovalCard.module.scss';

/** 卡内展示的条目视图（ChatPanel 用目录快照解析标题与现价；最终以 server 实时计价为准，裁决①）。 */
export interface ApprovalCardItem {
    productId: string;
    title: string;
    quantity: number;
    unitPrice: number;
}

export type ApprovalCardPhase = 'pending' | 'approved' | 'rejected' | 'edited' | 'cancelled';

interface ApprovalCardProps {
    items: ApprovalCardItem[];
    /** 审批单号（ai@7 请求帧无 orderId 字段，前端以 approvalId 为单号展示，报告已登记）。 */
    approvalId: string;
    /** TTL 截止时刻（store 推导 = 收帧时刻 + 300s）；卡内 1s 级倒计时。 */
    expiresAt: number;
    requestReason?: string;
    phase: ApprovalCardPhase;
    /** reject 决策原因（phase=rejected 时展示）。 */
    decisionReason?: string;
    /** G3.4 裁决①：审批 pending 遇流错误时的卡内最小提示（如「操作失败，可重试」）。 */
    notice?: string | null;
    onApprove: () => void;
    onReject: (reason: string) => void;
    onEditConfirm: (items: { productId: string; quantity: number }[]) => void;
    onCancel: () => void;
}

/** 预设拒绝原因（最小形态：预设项 + 自定义输入）。 */
const REJECT_PRESETS = ['太贵了', '暂时不需要', '想换其他商品'] as const;

type CardMode = 'view' | 'reject' | 'edit';

function formatMoney(amount: number): string {
    return `$${amount.toFixed(2)}`;
}

function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * 订单审批卡（G3.3 裁决② 整体替换 G2.4 静态占位）：props 驱动纯展示 + 回调。
 * 订单摘要（条目 / 数量 / 小计 / 合计 / 单号 / TTL 倒计时）+ 四操作：
 * 确认下单 / 拒绝（带 reason）/ 修改（数量步进 + 移除，确认后新 toolCall 重发，裁决③）/
 * 取消订单。INT-HITL-01~04 编号映射见单测。
 */
export function ApprovalCard({
    items,
    approvalId,
    expiresAt,
    requestReason,
    phase,
    decisionReason,
    notice,
    onApprove,
    onReject,
    onEditConfirm,
    onCancel,
}: ApprovalCardProps) {
    const [now, setNow] = useState(() => Date.now());
    const [mode, setMode] = useState<CardMode>('view');
    const [rejectReason, setRejectReason] = useState<string>(REJECT_PRESETS[0]);
    const [draftItems, setDraftItems] = useState(items);

    // TTL 倒计时：卡内 1s 级刷新（coder 定手法：setInterval + Date.now）
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const remainingMs = expiresAt - now;
    const expired = remainingMs <= 0;
    const interactive = phase === 'pending' && !expired && mode === 'view';
    const total = useMemo(
        () => items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        [items],
    );
    const draftTotal = useMemo(
        () => draftItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        [draftItems],
    );

    const stepDraft = (productId: string, delta: number) => {
        setDraftItems((current) =>
            current.map((item) =>
                item.productId === productId
                    ? { ...item, quantity: Math.max(1, item.quantity + delta) }
                    : item,
            ),
        );
    };

    const removeDraft = (productId: string) => {
        setDraftItems((current) => current.filter((item) => item.productId !== productId));
    };

    return (
        <div className={styles.card} data-testid="approval-card">
            <div className={styles.header}>
                <span className={styles.title}>订单审批</span>
                <span className={styles.approvalId}>审批单号 {approvalId}</span>
                {phase === 'pending' ? (
                    expired ? (
                        <span className={styles.expired} role="status">
                            已过期，请重新发起
                        </span>
                    ) : (
                        <span className={styles.countdown}>
                            剩余 {formatCountdown(remainingMs)}
                        </span>
                    )
                ) : null}
            </div>

            {requestReason ? <p className={styles.reason}>{requestReason}</p> : null}
            {notice ? (
                <p className={styles.notice} data-testid="approval-notice">
                    {notice}
                </p>
            ) : null}

            {mode === 'edit' ? (
                <>
                    <ul className={styles.items}>
                        {draftItems.map((item) => (
                            <li key={item.productId} className={styles.editRow}>
                                <span className={styles.itemTitle}>{item.title}</span>
                                <span className={styles.stepper}>
                                    <button
                                        type="button"
                                        aria-label={`减少 ${item.title}`}
                                        onClick={() => stepDraft(item.productId, -1)}
                                    >
                                        −
                                    </button>
                                    <span data-testid={`edit-qty-${item.productId}`}>
                                        {item.quantity}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`增加 ${item.title}`}
                                        onClick={() => stepDraft(item.productId, 1)}
                                    >
                                        +
                                    </button>
                                </span>
                                <span className={styles.subtotal}>
                                    {formatMoney(item.unitPrice * item.quantity)}
                                </span>
                                <button
                                    type="button"
                                    className={styles.remove}
                                    aria-label={`移除 ${item.title}`}
                                    onClick={() => removeDraft(item.productId)}
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                    <p className={styles.total}>合计 {formatMoney(draftTotal)}</p>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.primary}
                            disabled={draftItems.length === 0}
                            onClick={() => {
                                setMode('view');
                                onEditConfirm(
                                    draftItems.map((item) => ({
                                        productId: item.productId,
                                        quantity: item.quantity,
                                    })),
                                );
                            }}
                        >
                            确认修改并重新发起
                        </button>
                        <button type="button" onClick={() => setMode('view')}>
                            返回
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <ul className={styles.items}>
                        {items.map((item) => (
                            <li key={item.productId} className={styles.itemRow}>
                                <span className={styles.itemTitle}>{item.title}</span>
                                <span className={styles.quantity}>× {item.quantity}</span>
                                <span className={styles.subtotal}>
                                    {formatMoney(item.unitPrice * item.quantity)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className={styles.total}>合计 {formatMoney(total)}</p>

                    {mode === 'reject' ? (
                        <div className={styles.rejectBox}>
                            <fieldset>
                                <legend>拒绝原因（会反馈给 AI 调整方案）</legend>
                                {REJECT_PRESETS.map((preset) => (
                                    <label key={preset} className={styles.preset}>
                                        <input
                                            type="radio"
                                            name="reject-reason"
                                            value={preset}
                                            checked={rejectReason === preset}
                                            onChange={() => setRejectReason(preset)}
                                        />
                                        {preset}
                                    </label>
                                ))}
                            </fieldset>
                            <input
                                className={styles.reasonInput}
                                type="text"
                                aria-label="自定义拒绝原因"
                                placeholder="或其他原因…"
                                value={
                                    REJECT_PRESETS.includes(
                                        rejectReason as (typeof REJECT_PRESETS)[number],
                                    )
                                        ? ''
                                        : rejectReason
                                }
                                onChange={(event) => setRejectReason(event.target.value)}
                            />
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={styles.danger}
                                    disabled={rejectReason.trim().length === 0}
                                    onClick={() => {
                                        setMode('view');
                                        onReject(rejectReason.trim());
                                    }}
                                >
                                    确认拒绝
                                </button>
                                <button type="button" onClick={() => setMode('view')}>
                                    返回
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.actions}>
                            {phase === 'approved' ? (
                                <span className={styles.executing} role="status">
                                    订单执行中…
                                </span>
                            ) : null}
                            {phase === 'rejected' ? (
                                <span className={styles.decided}>已拒绝：{decisionReason}</span>
                            ) : null}
                            {phase === 'edited' ? (
                                <span className={styles.decided}>已修改并重新发起</span>
                            ) : null}
                            {phase === 'cancelled' ? (
                                <span className={styles.decided}>已取消订单</span>
                            ) : null}
                            <button
                                type="button"
                                className={styles.primary}
                                disabled={!interactive}
                                onClick={onApprove}
                            >
                                确认下单
                            </button>
                            <button
                                type="button"
                                className={styles.danger}
                                disabled={!interactive}
                                onClick={() => setMode('reject')}
                            >
                                拒绝
                            </button>
                            <button
                                type="button"
                                disabled={!interactive}
                                onClick={() => {
                                    setDraftItems(items);
                                    setMode('edit');
                                }}
                            >
                                修改
                            </button>
                            <button type="button" onClick={onCancel}>
                                取消订单
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
