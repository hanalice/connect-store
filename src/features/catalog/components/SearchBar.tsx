import styles from './SearchBar.module.scss';
import { useEffect, useRef, useState } from 'react';

import { CATALOG_CONSTANTS } from '../constants/catalogConstants';

interface SearchBarProps {
    value?: string;
    onSearch: (value: string) => void;
    debounceMs?: number; // Debounce interval, default 500ms
}

export function SearchBar({
    value = '',
    onSearch,
    debounceMs = CATALOG_CONSTANTS.SEARCH_DEBOUNCE_MS,
}: SearchBarProps) {
    const [inputValue, setInputValue] = useState(value);
    const [lastSentValue, setLastSentValue] = useState(value);
    const timerRef = useRef<number | null>(null);

    // Sync input with external value (e.g. from URL or Reset button)
    useEffect(() => {
        setInputValue(value);
        setLastSentValue(value);
    }, [value]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const triggerSearch = (val: string) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        // Avoid redundant searches if the value hasn't changed
        if (val.trim() === lastSentValue?.trim()) return;

        setLastSentValue(val);
        onSearch(val);
    };

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
        const val = event.target.value;
        setInputValue(val);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            if (val.trim() !== lastSentValue?.trim()) {
                setLastSentValue(val);
                onSearch(val);
            }
        }, debounceMs);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') {
            triggerSearch(inputValue);
        }
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.inputContainer}>
                <input
                    id="keyword-search"
                    className={styles.input}
                    placeholder="Search by name or creator"
                    aria-label="Search by name or creator"
                    value={inputValue}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                />
                <button
                    className={styles.searchButton}
                    onClick={() => triggerSearch(inputValue)}
                    aria-label="Run search"
                    title="Run search"
                    type="button"
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        className={styles.searchIcon}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
