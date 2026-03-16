import type { ReactNode } from 'react'

import styles from './ProductGrid.module.scss'

interface ProductGridProps {
  children: ReactNode
}

export function ProductGrid({ children }: ProductGridProps) {
  return <section className={styles.grid}>{children}</section>
}