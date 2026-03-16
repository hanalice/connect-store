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
          { value: 'default', label: 'Default' },
          { value: 'price-desc', label: 'Price: High to Low' },
          { value: 'price-asc', label: 'Price: Low to High' },
          { value: 'title-asc', label: 'Title: A to Z' },
          { value: 'title-desc', label: 'Title: Z to A' },
        ]}
      />
    </div>
  )
}