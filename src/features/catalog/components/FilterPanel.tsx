import { PRICING_LABEL, PricingOption } from '../types/product'
import styles from './FilterPanel.module.scss'

interface FilterPanelProps {
  selected: PricingOption[]
  onToggle: (option: PricingOption) => void
  onReset: () => void
}

const OPTIONS: PricingOption[] = [PricingOption.PAID, PricingOption.FREE, PricingOption.VIEW_ONLY]

export function FilterPanel({ selected, onToggle, onReset }: FilterPanelProps) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Pricing Option</span>
      <div className={styles.options}>
        {OPTIONS.map((option) => (
          <label key={option} className={styles.option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
            />
            <span>{PRICING_LABEL[option]}</span>
          </label>
        ))}
      </div>

      <div className={styles.resetWrapper}>
        <button className={styles.reset} onClick={onReset} type="button">
          Reset
        </button>
      </div>
    </div>
  )
}