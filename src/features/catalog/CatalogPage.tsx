import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { EmptyState } from './components/EmptyState';
import { ErrorState } from './components/ErrorState';
import { FilterPanel } from './components/FilterPanel';
import { ProductCard } from './components/ProductCard';
import { ProductGrid } from './components/ProductGrid';
import { ProductSkeletonCard } from './components/ProductSkeletonCard';
import { SearchBar } from './components/SearchBar';
import { SortSelect } from './components/SortSelect';
import { ThemeToggle } from './components/ThemeToggle';
import { filterProducts, getVisibleProducts, sortProducts } from './selectors/catalogSelectors';
import { useCatalogStore } from './store/useCatalogStore';
import { usePreferenceStore } from './store/usePreferenceStore';
import { PricingOption, type SortMode } from './types/product';
import { readCatalogUrlState, writeCatalogUrlState } from './utils/catalogQueryParams';
import { CATALOG_CONSTANTS } from './constants/catalogConstants';
import styles from './CatalogPage.module.scss';

export function CatalogPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlState = useMemo(() => readCatalogUrlState(searchParams), [searchParams]);

    const {
        products,
        loading,
        error,
        visibleCount,
        chunkSize,
        fetchProducts,
        increaseVisibleCount,
        resetVisibleCount,
    } = useCatalogStore();

    const { theme, toggleTheme } = usePreferenceStore();
    const [isAppending, setIsAppending] = useState(false);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const appendTimerRef = useRef<number | null>(null);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const processedProducts = useMemo(() => {
        const filtered = filterProducts(products, {
            keyword: urlState.keyword,
            pricingOptions: urlState.pricingOptions,
            sortMode: urlState.sortMode,
        });

        return sortProducts(filtered, urlState.sortMode);
    }, [products, urlState.keyword, urlState.pricingOptions, urlState.sortMode]);

    const visibleProducts = useMemo(
        () => getVisibleProducts(processedProducts, visibleCount),
        [processedProducts, visibleCount],
    );

    const hasMore = visibleProducts.length < processedProducts.length;

    useEffect(() => {
        const target = sentinelRef.current;
        if (!target || !hasMore) {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            const isIntersecting = entries[0]?.isIntersecting;
            if (!isIntersecting) return;

            // Use functional update to avoid stale closure and dependency on isAppending
            setIsAppending((currentlyAppending) => {
                if (currentlyAppending) return true;

                // Start the append timer
                appendTimerRef.current = window.setTimeout(() => {
                    increaseVisibleCount();
                    setIsAppending(false);
                    appendTimerRef.current = null;
                }, CATALOG_CONSTANTS.APPEND_DELAY_MS);

                return true;
            });
        });

        observer.observe(target);
        return () => {
            observer.disconnect();
            // Note: We don't clear the timer here to avoid cancelling the load
            // during standard re-renders. The timer handles its own state.
        };
    }, [hasMore, increaseVisibleCount]);

    function patchUrlState(nextState: {
        keyword?: string;
        pricingOptions?: PricingOption[];
        sortMode?: SortMode;
    }) {
        // Reset scroll and pending states before shifting the URL
        resetVisibleCount();
        setIsAppending(false);

        const state = {
            keyword: nextState.keyword ?? urlState.keyword,
            pricingOptions: nextState.pricingOptions ?? urlState.pricingOptions,
            sortMode: nextState.sortMode ?? urlState.sortMode,
        };

        setSearchParams(writeCatalogUrlState(state), { replace: true });
    }

    function togglePricing(option: PricingOption) {
        const exists = urlState.pricingOptions.includes(option);
        const next = exists
            ? urlState.pricingOptions.filter((item) => item !== option)
            : [...urlState.pricingOptions, option];
        patchUrlState({ pricingOptions: next });
    }

    function resetFilters() {
        patchUrlState({ pricingOptions: [] });
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={[styles.headerInner, styles.container].join(' ')}>
                    <h1 className={styles.brandText}>CONNECT</h1>
                    <div className={styles.themeControl}>
                        <ThemeToggle theme={theme} onToggle={toggleTheme} />
                    </div>
                </div>
            </header>

            <main className={styles.mainContent}>
                <div className={styles.container}>
                    <div className={styles.controlStack}>
                        <section role="search" aria-label="Product Search">
                            <SearchBar
                                value={urlState.keyword}
                                onSearch={(keyword) => patchUrlState({ keyword })}
                            />
                        </section>

                        <section className={styles.filterRow} aria-label="Pricing filters">
                            <FilterPanel
                                selected={urlState.pricingOptions}
                                onToggle={togglePricing}
                                onReset={resetFilters}
                            />
                        </section>

                        <section className={styles.sortRow} aria-label="Sort options">
                            <SortSelect
                                value={urlState.sortMode}
                                onChange={(sortMode) => patchUrlState({ sortMode })}
                            />
                        </section>
                    </div>

                    {error ? <ErrorState message={error} onRetry={fetchProducts} /> : null}

                    {loading ? (
                        <ProductGrid>
                            {Array.from({ length: chunkSize }).map((_, index) => (
                                <ProductSkeletonCard key={`initial-skeleton-${index}`} />
                            ))}
                        </ProductGrid>
                    ) : null}

                    {!loading && !error && visibleProducts.length === 0 ? <EmptyState /> : null}

                    {!loading && !error && visibleProducts.length > 0 ? (
                        <>
                            <ProductGrid>
                                {visibleProducts.map((product) => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </ProductGrid>

                            {isAppending && processedProducts.length > visibleCount ? (
                                <ProductGrid>
                                    {Array.from({
                                        length: Math.min(
                                            chunkSize,
                                            processedProducts.length - visibleCount,
                                        ),
                                    }).map((_, index) => (
                                        <ProductSkeletonCard key={`append-skeleton-${index}`} />
                                    ))}
                                </ProductGrid>
                            ) : null}

                            <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
                        </>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
