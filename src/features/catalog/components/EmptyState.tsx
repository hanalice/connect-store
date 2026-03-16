import styles from './EmptyState.module.scss'

export function EmptyState() {
  return <p className={styles.empty}>No contents matched your current criteria.</p>
}