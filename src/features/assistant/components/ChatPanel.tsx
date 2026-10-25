import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { isAssistantBusy } from '../types/assistant';
import { useAssistantStore } from '../state/useAssistantStore';
import { useCatalogStore } from '../../catalog/store/useCatalogStore';
import { renderToolOutput } from '../registry/renderToolOutput';
import { AgentStatusBadge } from './AgentStatusBadge';
import { ApprovalCard } from './ApprovalCard';
import { ReasoningBlock } from './ReasoningBlock';
import { StreamingText } from './StreamingText';
import { ToolCallPanel } from './ToolCallPanel';
import styles from './ChatPanel.module.scss';

/** 距底部小于该阈值视为「用户在底部」，自动滚动才跟随（智能滚动阈值）。 */
const STICK_THRESHOLD_PX = 40;

export function ChatPanel() {
    const {
        messages,
        status,
        error,
        approval,
        approvalSuperseded,
        sendMessage,
        abort,
        approve,
        reject,
        editOrder,
        cancelOrder,
    } = useAssistantStore();
    const [draft, setDraft] = useState('');
    const listRef = useRef<HTMLDivElement | null>(null);
    const stickToBottomRef = useRef(true);
    /** 上次 effect 吸附后的 scrollTop：用于识别「位置已变但 scroll 事件尚未派发」的竞态窗口。 */
    const lastScrollTopRef = useRef(0);

    // isBusy 四态口径（裁决②）：thinking / streaming / tool_calling / tool_result，对应 USER_ABORT 四条边
    const isBusy = isAssistantBusy(status);
    // G3.3 裁决⑤：await_human 期间输入由审批卡承接（sendMessage 侧同口径拒绝）
    const isAwaitHuman = status === 'await_human';
    const inputLocked = isBusy || isAwaitHuman;

    // 审批卡条目解析：标题 / 现价取目录快照（裁决③ 展示值；最终以 server 实时计价为准）。
    // 审批到达时目录可能未加载（直开 assistant 页）——按需拉取一次，响应式重渲染。
    const products = useCatalogStore((state) => state.products);
    const fetchProducts = useCatalogStore((state) => state.fetchProducts);
    useEffect(() => {
        if (approval !== null && products.length === 0) {
            void fetchProducts();
        }
    }, [approval, products.length, fetchProducts]);

    const approvalItems = useMemo(
        () =>
            approval === null
                ? []
                : approval.items.map((item) => {
                      const product = products.find((entry) => entry.id === item.productId);
                      return {
                          productId: item.productId,
                          title: product?.title ?? item.productId,
                          quantity: item.quantity,
                          unitPrice: product?.price ?? 0,
                      };
                  }),
        [approval, products],
    );

    // 智能自动滚动：滚动时记录用户是否在底部；上滑阅读后不抢滚动
    const handleScroll = () => {
        const el = listRef.current;
        if (!el) return;
        stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
    };

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        // scroll 事件派发存在延迟：位置已变（程序化滚动等）但 handleScroll 未跑时，
        // 用实时位置复核吸附标记，避免把用户刚拉上去的列表又拽回底部（E2E-AI-05 竞态防护）
        if (stickToBottomRef.current && el.scrollTop !== lastScrollTopRef.current) {
            stickToBottomRef.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
        }
        if (stickToBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
        lastScrollTopRef.current = el.scrollTop;
    }, [messages, status]);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!draft.trim() || inputLocked) return;
        stickToBottomRef.current = true;
        void sendMessage(draft);
        setDraft('');
    };

    return (
        <div className={styles.panel}>
            <div
                className={styles.messageList}
                ref={listRef}
                onScroll={handleScroll}
                role="log"
                aria-label="对话消息列表"
            >
                {messages.length === 0 ? (
                    <p className={styles.placeholder}>试试问我：「推荐免费的素材」</p>
                ) : null}
                {messages.map((message, index) => {
                    const isLastAssistant =
                        message.role === 'assistant' && index === messages.length - 1;
                    const streaming = isLastAssistant && isBusy;
                    const isEmptyAssistant =
                        message.role === 'assistant' && !message.text && !message.reasoning;

                    return (
                        <div
                            key={message.id}
                            className={
                                message.role === 'user' ? styles.userRow : styles.assistantRow
                            }
                        >
                            <div
                                className={
                                    message.role === 'user'
                                        ? styles.userBubble
                                        : styles.assistantBubble
                                }
                            >
                                {message.role === 'user' ? (
                                    message.text
                                ) : (
                                    <>
                                        <ReasoningBlock
                                            reasoning={message.reasoning}
                                            streaming={streaming}
                                        />
                                        <ToolCallPanel toolCalls={message.toolCalls ?? []} />
                                        {(message.toolCalls ?? [])
                                            .filter(
                                                (call) =>
                                                    call.output !== undefined ||
                                                    call.error !== undefined,
                                            )
                                            .map((call) => (
                                                <Fragment key={`tool-ui-${call.toolCallId}`}>
                                                    {renderToolOutput(call)}
                                                </Fragment>
                                            ))}
                                        {approvalSuperseded !== null &&
                                        message.id === approvalSuperseded.messageId ? (
                                            <p className={styles.supersededNote}>
                                                {approvalSuperseded.note}
                                            </p>
                                        ) : null}
                                        {approval !== null && message.id === approval.messageId ? (
                                            <ApprovalCard
                                                items={approvalItems}
                                                approvalId={approval.approvalId}
                                                expiresAt={approval.expiresAt}
                                                requestReason={approval.requestReason}
                                                phase={approval.phase}
                                                decisionReason={approval.decisionReason}
                                                onApprove={approve}
                                                onReject={reject}
                                                onEditConfirm={editOrder}
                                                onCancel={cancelOrder}
                                            />
                                        ) : null}
                                        {message.text ? (
                                            <StreamingText
                                                text={message.text}
                                                streaming={streaming}
                                            />
                                        ) : null}
                                        {isEmptyAssistant && streaming ? (
                                            <span className={styles.thinking} role="status">
                                                思考中…
                                            </span>
                                        ) : null}
                                        {isEmptyAssistant && !streaming ? (
                                            <span className={styles.emptyNote}>（未生成内容）</span>
                                        ) : null}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {status === 'error' && error ? (
                <div className={styles.errorBanner} role="alert">
                    {error}
                </div>
            ) : null}
            {status === 'aborted' ? (
                <div className={styles.abortedBanner} role="status">
                    已停止生成，可继续发送新消息
                </div>
            ) : null}

            <AgentStatusBadge status={status} />

            <form className={styles.composer} onSubmit={handleSubmit}>
                <input
                    className={styles.input}
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={
                        isBusy
                            ? '生成中…'
                            : isAwaitHuman
                              ? '请先完成上方订单审批'
                              : '输入你的需求，如「推荐免费的素材」'
                    }
                    aria-label="消息输入框"
                    disabled={inputLocked}
                />
                {isBusy ? (
                    <button type="button" className={styles.stopButton} onClick={abort}>
                        停止
                    </button>
                ) : (
                    <button type="submit" className={styles.sendButton} disabled={!draft.trim()}>
                        发送
                    </button>
                )}
            </form>
        </div>
    );
}
