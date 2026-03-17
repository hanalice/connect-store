import styles from './SearchBar.module.scss';
import { useRef, useState } from 'react';

interface SearchBarProps {
    value?: string;
    onSearch: (value: string) => void;
    debounceMs?: number; // Debounce interval, default 500ms
}

export function SearchBar({ value = '', onSearch, debounceMs = 500 }: SearchBarProps) {
    const [inputValue, setInputValue] = useState(value);
    const timerRef = useRef<number | null>(null);
    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
        const val = event.target.value;
        setInputValue(val);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            onSearch(val);
        }, debounceMs);
    }
    return (
        <div className={styles.wrapper}>
            <input
                id="keyword-search"
                className={styles.input}
                placeholder="Search by creator or item title"
                aria-label="Search by creator or item title"
                value={inputValue}
                onChange={handleChange}
            />
        </div>
    );
}
