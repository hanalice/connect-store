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
});
