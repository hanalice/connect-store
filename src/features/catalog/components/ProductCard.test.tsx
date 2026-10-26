import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import { PricingOption } from '../types/product';

const mockProduct = {
    id: '1',
    title: 'Test Product',
    creator: 'Test Creator',
    pricingOption: PricingOption.PAID,
    price: 99.9,
    imagePath: 'https://example.com/test.jpg',
};

describe('ProductCard Component', () => {
    it('renders image when imagePath is provided and valid', () => {
        render(<ProductCard product={mockProduct} />);
        const img = screen.getByRole('img');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', mockProduct.imagePath);
    });

    it('renders placeholder when imagePath is missing', () => {
        const noImgProduct = { ...mockProduct, imagePath: '' };
        render(<ProductCard product={noImgProduct} />);

        // The <img> element should not be present
        expect(screen.queryByRole('img', { name: mockProduct.title })).not.toBeInTheDocument();
        // But the placeholder with role="img" should be
        expect(screen.getByRole('img', { name: /image not available/i })).toBeInTheDocument();
    });

    it('falls back to placeholder when image loading fails (onError)', () => {
        render(<ProductCard product={mockProduct} />);

        const img = screen.getByRole('img', { name: mockProduct.title });
        expect(img).toBeInTheDocument();

        // Simulate image load error
        fireEvent.error(img);

        // Original image should be removed
        expect(screen.queryByRole('img', { name: mockProduct.title })).not.toBeInTheDocument();
        // Placeholder should be visible now
        expect(screen.getByRole('img', { name: /image not available/i })).toBeInTheDocument();
    });

    it('gracefully handles missing price with default 0.00', () => {
        const brokenPriceProduct = { ...mockProduct, price: undefined };
        // @ts-expect-error Testing runtime resilience against missing price
        render(<ProductCard product={brokenPriceProduct} />);

        // Should display $0.00 instead of crashing or showing NaN
        expect(screen.getByText(/\$0\.00/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/price \$0\.00/i)).toBeInTheDocument();
    });

    it('renders a named article without button semantics or a card tab stop', () => {
        render(<ProductCard product={mockProduct} />);

        const card = screen.getByRole('article', {
            name: 'Test Product by Test Creator, price $99.90',
        });
        expect(card).not.toHaveAttribute('tabindex');
        expect(screen.queryByRole('button', { name: /test product/i })).not.toBeInTheDocument();
    });

    it('keeps complete title and creator text available from keyboard-focusable tooltips', () => {
        const longProduct = {
            ...mockProduct,
            title: 'An exceptionally detailed product title that remains complete',
            creator: 'A creator with an exceptionally long display name',
        };
        const { container } = render(<ProductCard product={longProduct} />);

        const title = screen.getByRole('heading', { name: longProduct.title });
        const creator = screen.getByText(longProduct.creator);
        const titleTrigger = title.parentElement!;
        const creatorTrigger = creator.parentElement!;
        const titleTooltip = document.getElementById(
            titleTrigger.getAttribute('aria-describedby')!,
        );
        const creatorTooltip = document.getElementById(
            creatorTrigger.getAttribute('aria-describedby')!,
        );

        expect(container.querySelector('details')).toBeNull();
        expect(container.querySelector('summary')).toBeNull();
        for (const trigger of [titleTrigger, creatorTrigger]) {
            expect(trigger.tagName).toBe('DIV');
            expect(trigger).toHaveAttribute('tabindex', '0');
            expect(trigger).not.toHaveAttribute('role');
            expect(trigger).not.toHaveAttribute('aria-expanded');
            expect(trigger).not.toHaveAttribute('aria-haspopup');
        }
        expect(titleTooltip).toHaveAttribute('role', 'tooltip');
        expect(creatorTooltip).toHaveAttribute('role', 'tooltip');
        expect(titleTooltip).toHaveAttribute('data-full-text', longProduct.title);
        expect(creatorTooltip).toHaveAttribute('data-full-text', longProduct.creator);

        titleTrigger.focus();
        expect(titleTrigger).toHaveFocus();
        creatorTrigger.focus();
        expect(creatorTrigger).toHaveFocus();
    });
});
