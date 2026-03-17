import { create } from 'zustand';

import { getProducts } from '../services/productApi';
import type { Product } from '../types/product';

interface CatalogStore {
    products: Product[];
    loading: boolean;
    error: string | null;
    visibleCount: number;
    chunkSize: number;
    fetchProducts: () => Promise<void>;
    setVisibleCount: (count: number) => void;
    increaseVisibleCount: () => void;
    resetVisibleCount: () => void;
}

const INITIAL_CHUNK_SIZE = 20;

export const useCatalogStore = create<CatalogStore>((set, get) => ({
    products: [],
    loading: false,
    error: null,
    visibleCount: INITIAL_CHUNK_SIZE,
    chunkSize: INITIAL_CHUNK_SIZE,
    async fetchProducts() {
        set({ loading: true, error: null });

        try {
            const products = await getProducts();
            set({ products, loading: false });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch products';
            set({ loading: false, error: message });
        }
    },
    setVisibleCount(count) {
        set({ visibleCount: count });
    },
    increaseVisibleCount() {
        const { visibleCount, chunkSize } = get();
        set({ visibleCount: visibleCount + chunkSize });
    },
    resetVisibleCount() {
        const { chunkSize } = get();
        set({ visibleCount: chunkSize });
    },
}));
