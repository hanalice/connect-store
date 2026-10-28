import { useEffect, useId, useRef, useState } from 'react';
import { PRICING_LABEL, PricingOption, type Product } from '../types/product';
import styles from './ProductCard.module.scss';

interface ProductCardProps {
    product: Product;
}

interface TruncatedTextProps {
    text: string;
    className: string;
    heading?: boolean;
}

function TruncatedText({ text, className, heading = false }: TruncatedTextProps) {
    const [isTruncated, setIsTruncated] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const textRef = useRef<HTMLElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipId = useId();

    useEffect(() => {
        let isMounted = true;
        const measure = () => {
            const element = textRef.current;
            if (!isMounted || !element) return;

            const truncated = element.scrollWidth > element.clientWidth;
            setIsTruncated(truncated);
            if (!truncated) {
                setIsOpen(false);
                setIsDismissed(false);
            }
        };

        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        if (textRef.current) observer?.observe(textRef.current);
        if (triggerRef.current) observer?.observe(triggerRef.current);

        const fonts = document.fonts;
        void fonts?.ready.then(measure);
        fonts?.addEventListener('loadingdone', measure);

        return () => {
            isMounted = false;
            observer?.disconnect();
            fonts?.removeEventListener('loadingdone', measure);
        };
    }, [text]);

    useEffect(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        if (isTruncated) trigger.setAttribute('tabindex', '0');
        else trigger.removeAttribute('tabindex');
    }, [isTruncated]);

    useEffect(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== 'Escape' || !isOpen) return;
            event.preventDefault();
            event.stopPropagation();
            setIsOpen(false);
            setIsDismissed(true);
        }

        trigger.addEventListener('keydown', handleKeyDown);
        return () => trigger.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    function openTooltip() {
        if (isTruncated && !isDismissed) setIsOpen(true);
    }

    return (
        <div
            className={styles.textWithTooltip}
            onMouseEnter={openTooltip}
            onMouseLeave={(event) => {
                if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                )
                    return;
                setIsDismissed(false);
                if (!event.currentTarget.contains(document.activeElement)) setIsOpen(false);
            }}
            onBlur={(event) => {
                if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                )
                    return;
                setIsOpen(false);
                setIsDismissed(false);
            }}
        >
            <div
                ref={triggerRef}
                className={styles.textTrigger}
                aria-describedby={isTruncated ? tooltipId : undefined}
                onFocus={openTooltip}
            >
                {heading ? (
                    <h3
                        ref={(element) => {
                            textRef.current = element;
                        }}
                        className={className}
                    >
                        {text}
                    </h3>
                ) : (
                    <span
                        ref={(element) => {
                            textRef.current = element;
                        }}
                        className={className}
                    >
                        {text}
                    </span>
                )}
            </div>
            {isTruncated ? (
                <span
                    id={tooltipId}
                    className={`${styles.tooltip}${isOpen ? ` ${styles.tooltipVisible}` : ''}`}
                    role="tooltip"
                >
                    {text}
                </span>
            ) : null}
        </div>
    );
}

export function ProductCard({ product }: ProductCardProps) {
    const [imgError, setImgError] = useState(false);
    const pricingLabel = PRICING_LABEL[product.pricingOption];

    return (
        // H6-N2a 二次拍板（2026-10-28）：卡片整体进 Tab 序（tabIndex=0），
        // aria-label 自含 title/creator/price——G5.1 撤按钮后焦点路径下卡片内容唯一通道；
        // 截断 title/creator 仍各自挂 tabindex 作 tooltip 触发器（TruncatedText 内部逻辑）
        <article
            className={styles.card}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- H6-N2a 二次拍板（2026-10-28）：卡片即 Tab 阅读单元，aria-label 自含 title/creator/price；G5.1 撤按钮后焦点路径唯一内容通道
            tabIndex={0}
            aria-label={`${product.title} by ${product.creator}, price ${
                product.pricingOption === PricingOption.PAID
                    ? '$' + (product.price ?? 0).toFixed(2)
                    : pricingLabel
            }`}
        >
            {product.imagePath && !imgError ? (
                <img
                    className={styles.image}
                    src={product.imagePath}
                    alt={product.title}
                    loading="lazy"
                    onError={() => setImgError(true)}
                />
            ) : (
                <div
                    className={styles.imagePlaceholder}
                    data-testid="product-image-placeholder"
                    role="img"
                    aria-label={`${product.title} - Image not available`}
                >
                    <div className={styles.placeholderContent}>
                        <svg
                            viewBox="0 0 24 24"
                            width="28"
                            height="28"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span className={styles.placeholderText}>Image not available</span>
                    </div>
                </div>
            )}
            <div className={styles.metaRow}>
                <div className={styles.meta}>
                    <TruncatedText text={product.title} className={styles.title} heading />
                    <TruncatedText text={product.creator} className={styles.creator} />
                </div>
                <div className={styles.priceInfo}>
                    {product.pricingOption === PricingOption.PAID ? (
                        <span className={styles.priceDetail}>
                            ${(product.price ?? 0).toFixed(2)}
                        </span>
                    ) : (
                        <span className={styles.priceDetail}>{pricingLabel}</span>
                    )}
                </div>
            </div>
        </article>
    );
}
