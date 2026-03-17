import type { SortMode } from '../types/product'
import styles from './SortSelect.module.scss'
import { CustomSelect } from './CustomSelect'

interface SortSelectProps {
  value: SortMode
  onChange: (value: SortMode) => void
}

export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <div className={styles.wrapper}>
      <CustomSelect<SortMode>
        value={value}
        onChange={onChange}
        label="Sort by"
        id="sort-select"
        options={[
          { value: 'default', label: 'Item Name' },
          { value: 'price-desc', label: 'Higher Price' },
          { value: 'price-asc', label: 'Lower Price' },
        ]}
      />
    </div>
  )
}