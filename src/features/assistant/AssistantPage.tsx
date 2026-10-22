import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { ThemeToggle } from '../catalog/components/ThemeToggle';
import { usePreferenceStore } from '../catalog/store/usePreferenceStore';
import { ChatPanel } from './components/ChatPanel';
import styles from './AssistantPage.module.scss';

export function AssistantPage() {
    const { theme, toggleTheme } = usePreferenceStore();

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <Link to="/" className={styles.backLink}>
                        ← 返回目录
                    </Link>
                    <h1 className={styles.title}>AI 导购助手</h1>
                    <ThemeToggle theme={theme} onToggle={toggleTheme} />
                </div>
            </header>
            <main className={styles.main}>
                <ChatPanel />
            </main>
        </div>
    );
}
