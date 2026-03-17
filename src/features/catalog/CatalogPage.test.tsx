import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductSkeletonCard } from './components/ProductSkeletonCard';
import { MemoryRouter } from 'react-router-dom';
import { CatalogPage } from './CatalogPage';
import * as productApi from './services/productApi';
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
        imagePath: '',
        price: 50,
    },
    {
        id: 'p2',
        creator: 'Anisha',
        title: 'Black Heels',
        pricingOption: PricingOption.FREE,
        imagePath: '',
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
        const searchInput = screen.getByPlaceholderText(/Find the items/i);
        fireEvent.change(searchInput, { target: { value: 'Adam' } });

        // Check "Paid" filter
        const paidCheckbox = screen.getByLabelText('Paid');
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
        const searchInput = screen.getByPlaceholderText(/Find the items/i) as HTMLInputElement;
        expect(searchInput.value).toBe('Adam');

        const paidCheckbox = screen.getByLabelText('Paid') as HTMLInputElement;
        expect(paidCheckbox.checked).toBe(true);

        // Click Reset
        const resetButton = screen.getByRole('button', { name: /reset/i });
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

        const searchInput = screen.getByPlaceholderText(/Find the items/i);
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

        // Landmarks
        // Depending on RTL environment, 'header' is role 'banner' if it's top-level
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('main')).toBeInTheDocument();

        // Inputs
        expect(screen.getByLabelText(/Find the items/i)).toBeInTheDocument();
        expect(screen.getByLabelText('Paid')).toBeInTheDocument();
        // For SortSelect, label is "Sort by"
        expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
    });

    it('INT-10: Switches theme from Dark to Light', async () => {
        render(
            <MemoryRouter>
                <CatalogPage />
            </MemoryRouter>,
        );

        // Check initial state
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

        // Find and click the theme button to open options
        const themeButton = screen.getByRole('button', { name: /theme/i });
        fireEvent.click(themeButton);

        // Click the "Light" option
        const lightOption = screen.getByRole('option', { name: 'Light' });
        fireEvent.mouseDown(lightOption); // CustomSelect uses onMouseDown for selection

        // Verify attribute update
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
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
});
