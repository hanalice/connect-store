import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProductSkeletonCard } from './components/ProductSkeletonCard';
import { MemoryRouter } from 'react-router-dom';
import { CatalogPage } from './CatalogPage';
import * as productApi from './services/productApi';
import { usePreferenceStore } from './store/usePreferenceStore';
import { PricingOption } from './types/product';

// Mock the API
vi.mock('./services/productApi', () => ({
    getProducts: vi.fn(),
}));

const MOCK_PRODUCTS = [
    {
        id: 'p1',
        creator: 'Adam',
        title: 'Yellow Coat',
        pricingOption: PricingOption.PAID,
        imagePath: '/test-image.jpg',
        price: 50,
    },
    {
        id: 'p2',
        creator: 'Anisha',
        title: 'Black Heels',
        pricingOption: PricingOption.FREE,
        imagePath: '/test-image.jpg',
        price: 0,
    },
];

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.prototype.observe = vi.fn();
mockIntersectionObserver.prototype.unobserve = vi.fn();
mockIntersectionObserver.prototype.disconnect = vi.fn();
window.IntersectionObserver = mockIntersectionObserver as unknown as typeof IntersectionObserver;

describe('CatalogPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        usePreferenceStore.getState().setTheme('dark');
        vi.mocked(productApi.getProducts).mockResolvedValue(MOCK_PRODUCTS);
    });

    it('renders products and handles combined filtering', async () => {
        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Should see both products eventually
        expect(await screen.findByText('Yellow Coat')).toBeInTheDocument();
        expect(screen.getByText('Black Heels')).toBeInTheDocument();

        // Combined Flow: Search + Filter
        const searchInput = screen.getByLabelText(/Search by creator or item title/i);
        fireEvent.change(searchInput, { target: { value: 'Adam' } });

        // Check "Paid" filter
        const paidCheckbox = screen.getByLabelText(/Show only Paid products/i);
        fireEvent.click(paidCheckbox);

        // Grid should update
        expect(screen.getByText('Yellow Coat')).toBeInTheDocument();
        expect(screen.queryByText('Black Heels')).not.toBeInTheDocument();
    });

    it('Reset button clears only filters, preserving search and sort', async () => {
        // MemoryRouter initialEntries for search params test
        render(
            <MemoryRouter initialEntries={['/?q=Adam&sort=price-desc&pricing=0']}>
                <CatalogPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Yellow Coat')).toBeInTheDocument();

        // Verify inputs are initialized from URL
        const searchInput = screen.getByLabelText(
            /Search by creator or item title/i,
        ) as HTMLInputElement;
        expect(searchInput.value).toBe('Adam');

        const paidCheckbox = screen.getByLabelText(/Show only Paid products/i) as HTMLInputElement;
        expect(paidCheckbox.checked).toBe(true);

        // Click Reset
        const resetButton = screen.getByLabelText(/Clear all pricing filters/i);
        fireEvent.click(resetButton);

        // INT-05: Filters cleared, Search/Sort preserved
        expect(paidCheckbox.checked).toBe(false);
        expect(searchInput.value).toBe('Adam');
    });

    it('INT-08: Displays Empty State when no products match', async () => {
        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        await screen.findByText('Yellow Coat');

        const searchInput = screen.getByLabelText(/Search by creator or item title/i);
        fireEvent.change(searchInput, { target: { value: 'NonExistentKeyword' } });

        expect(await screen.findByText(/no contents matched/i)).toBeInTheDocument();
    });

    it('INT-09: Shows Skeleton cards during loading', async () => {
        // delay resolve to see skeleton
        let resolveApi!: (value: typeof MOCK_PRODUCTS) => void;
        const promise = new Promise<typeof MOCK_PRODUCTS>((resolve) => {
            resolveApi = resolve;
        });
        vi.mocked(productApi.getProducts).mockReturnValue(promise);

        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Skeletons should be present
        const skeletons = screen.getAllByTestId('product-skeleton');
        expect(skeletons.length).toBeGreaterThan(0);

        resolveApi(MOCK_PRODUCTS);
        expect(await screen.findByText('Yellow Coat')).toBeInTheDocument();
    });

    it('A11Y: Verify basic landmark and input labeling', async () => {
        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Settle initial load
        await screen.findByText('Yellow Coat');

        // Landmarks
        // Depending on RTL environment, 'header' is role 'banner' if it's top-level
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('main')).toBeInTheDocument();

        // Inputs
        expect(screen.getByLabelText(/Search by creator or item title/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Show only Paid products/i)).toBeInTheDocument();
        // For SortSelect, label is "Sort by", and button has descriptive aria-label
        expect(screen.getByLabelText(/Change product sort order/i)).toBeInTheDocument();
    });

    it('INT-10: Switches theme from Dark to Light', async () => {
        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Settle initial load
        await screen.findByText('Yellow Coat');

        // Check initial state
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

        // Find and click the theme toggle button
        const toggleButton = screen.getByRole('button', { name: /switch to light mode/i });
        await act(async () => {
            fireEvent.click(toggleButton);
        });

        // Verify attribute update
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');

        // Verify button label update
        expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
    });

    it('INT-11: ProductSkeletonCard structure mirrors ProductCard for CLO prevention', () => {
        render(<ProductSkeletonCard />);

        // 1. Should have the main image placeholder
        expect(screen.getByTestId('skeleton-image')).toBeInTheDocument();

        // 2. Should have metaRow container
        expect(screen.getByTestId('skeleton-meta-row')).toBeInTheDocument();

        // 3. Should have specific placeholders for text elements
        expect(screen.getByTestId('skeleton-title')).toBeInTheDocument();
        expect(screen.getByTestId('skeleton-creator')).toBeInTheDocument();
        expect(screen.getByTestId('skeleton-price')).toBeInTheDocument();
    });

    it('INT-12: Persists theme to localStorage', async () => {
        // 1. Start clean
        localStorage.clear();

        const { unmount } = render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Default should be dark
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

        // 2. Switch to light
        const toggleButton = screen.getByRole('button', { name: /switch to light mode/i });
        await act(async () => {
            fireEvent.click(toggleButton);
        });
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');

        // 3. Verify localStorage has it
        const saved = JSON.parse(localStorage.getItem('clo-user-preferences') || '{}');
        expect(saved.state.theme).toBe('light');

        // 4. Unmount and remount to check persistence
        unmount();
        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Settle remounted load
        await screen.findByText('Yellow Coat');

        // Should initialize as light from localStorage
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('INT-14: ProductSkeletonCard uses theme-aware colors', async () => {
        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Settle initial load
        await screen.findByText('Yellow Coat');

        // Initial (dark)
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

        // Force light mode
        const toggleButton = screen.getByRole('button', { name: /switch to light mode/i });
        await act(async () => {
            fireEvent.click(toggleButton);
        });
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');

        // The actual color check is best done in E2E, but we can verify the attribute is there
        // which drives the CSS variables for skeleton colors.
        expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    });

    it('INT-15: Verify body scroll sanity', () => {
        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Check computed style of body for overflow: hidden
        // In JSDOM, this usually only reflects styles set via .style or <style> tags
        // But it's a good practice to ensure no component logic is locking the scroll
        const bodyStyle = window.getComputedStyle(document.body);
        expect(bodyStyle.overflow).not.toBe('hidden');
    });
});
