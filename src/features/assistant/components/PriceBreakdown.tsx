import { PRICING_LABEL, PricingOption, type Product } from '../../catalog/types/product';
import styles from './PriceBreakdown.module.scss';

interface PriceBreakdownProps {
    product: Product;
}

/**
 * 单件商品的价格拆分卡（registry：tool-getProductDetails 命中分支）。
 * 货币口径与存量 ProductCard 一致：Paid 显示 $x.xx，Free/View Only 显示 PRICING_LABEL 枚举标签。
 */
export function PriceBreakdown({ product }: PriceBreakdownProps) {
    const isPaid = product.pricingOption === PricingOption.PAID;
    const amount = isPaid
        ? `$${(product.price ?? 0).toFixed(2)}`
        : PRICING_LABEL[product.pricingOption];

    return (
        <div className={styles.card}>
            <h3 className={styles.title}>{product.title}</h3>
            <dl className={styles.rows}>
                <div className={styles.row}>
                    <dt>计价方式</dt>
                    <dd>{PRICING_LABEL[product.pricingOption]}</dd>
                </div>
                <div className={styles.row}>
                    <dt>单价</dt>
                    <dd>{amount}</dd>
                </div>
                <div className={styles.row}>
                    <dt>合计</dt>
                    <dd className={styles.total}>{amount}</dd>
                </div>
            </dl>
        </div>
    );
}
