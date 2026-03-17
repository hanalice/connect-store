import type { SortMode } from '../types/product';
import styles from './SortSelect.module.scss';
import { CustomSelect } from './CustomSelect';

interface SortSelectProps {
    value: SortMode;
    onChange: (value: SortMode) => void;
}

export function SortSelect({ value, onChange }: SortSelectProps) {
    return (
        <div className={styles.wrapper}>
            <CustomSelect<SortMode>
                value={value}
                onChange={onChange}
                label="Sort by"
                id="sort-select"
                ariaLabel="Change product sort order"
                options={[
                    { value: 'default', label: 'Name: A to Z' },
                    { value: 'price-desc', label: 'Price: High to Low' },
                    { value: 'price-asc', label: 'Price: Low to High' },
                ]}
            />
        </div>
    );
}
