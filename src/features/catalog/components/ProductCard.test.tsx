import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PricingOption } from '../types/product';
import { ProductCard } from './ProductCard';

const mockProduct = {
    id: '1',
    title: 'Test Product',
    creator: 'Test Creator',
    pricingOption: PricingOption.PAID,
    price: 99.9,
    imagePath: 'https://example.com/test.jpg',
};

const longProduct = {
    ...mockProduct,
    title: 'An exceptionally detailed product title that remains complete',
    creator: 'A creator with an exceptionally long display name',
};

const widths = new WeakMap<Element, { scroll: number; client: number }>();
const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
let resizeCallbacks: ResizeObserverCallback[];
let observe: ReturnType<typeof vi.fn>;
let disconnect: ReturnType<typeof vi.fn>;
let fontSet: {
    ready: Promise<void>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
};

function setWidth(element: Element, scroll: number, client = 100) {
    widths.set(element, { scroll, client });
}

function remeasure() {
    act(() => {
        for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
    });
}

function getElements(product = mockProduct) {
    const title = screen.getByRole('heading', { name: product.title });
    const creator = screen.getByText(product.creator);
    return {
        title,
        creator,
        titleTrigger: title.parentElement!,
        creatorTrigger: creator.parentElement!,
    };
}

function getTooltip(trigger: HTMLElement) {
    const id = trigger.getAttribute('aria-describedby');
    return id ? document.getElementById(id) : null;
}

function expectDisabled(trigger: HTMLElement) {
    expect(trigger).not.toHaveAttribute('tabindex');
    expect(trigger).not.toHaveAttribute('aria-describedby');
    expect(getTooltip(trigger)).toBeNull();
}

function expectEnabled(trigger: HTMLElement, text: string) {
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger).not.toHaveAttribute('role');
    expect(trigger).not.toHaveAttribute('aria-expanded');
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    const tooltip = getTooltip(trigger);
    expect(tooltip).toHaveAttribute('role', 'tooltip');
    expect(tooltip).toHaveTextContent(text);
}

describe('ProductCard Component', () => {
    beforeEach(() => {
        resizeCallbacks = [];
        Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
            configurable: true,
            get() {
                return widths.get(this)?.scroll ?? 0;
            },
        });
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get() {
                return widths.get(this)?.client ?? 100;
            },
        });
        observe = vi.fn();
        disconnect = vi.fn();
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: ResizeObserverCallback) {
                    resizeCallbacks.push(callback);
                }
                observe = observe;
                unobserve = vi.fn();
                disconnect = disconnect;
            },
        );
        fontSet = {
            ready: new Promise<void>(() => {}),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
        Object.defineProperty(document, 'fonts', { configurable: true, value: fontSet });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    afterAll(() => {
        if (originalScrollWidth) {
            Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth);
        }
        if (originalClientWidth) {
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
        if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
        else Reflect.deleteProperty(document, 'fonts');
    });

    it('renders image when imagePath is provided and valid', () => {
        render(<ProductCard product={mockProduct} />);
        const img = screen.getByRole('img');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', mockProduct.imagePath);
    });

    it('renders placeholder when imagePath is missing', () => {
        render(<ProductCard product={{ ...mockProduct, imagePath: '' }} />);
        expect(screen.queryByRole('img', { name: mockProduct.title })).not.toBeInTheDocument();
        expect(screen.getByRole('img', { name: /image not available/i })).toBeInTheDocument();
    });

    it('falls back to placeholder when image loading fails (onError)', () => {
        render(<ProductCard product={mockProduct} />);
        const img = screen.getByRole('img', { name: mockProduct.title });
        fireEvent.error(img);
        expect(screen.queryByRole('img', { name: mockProduct.title })).not.toBeInTheDocument();
        expect(screen.getByRole('img', { name: /image not available/i })).toBeInTheDocument();
    });

    it('gracefully handles missing price with default 0.00', () => {
        // @ts-expect-error Testing runtime resilience against missing price
        render(<ProductCard product={{ ...mockProduct, price: undefined }} />);
        expect(screen.getByText(/\$0\.00/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/price \$0\.00/i)).toBeInTheDocument();
    });

    it('renders a named article without button semantics or a card tab stop', () => {
        const { container } = render(<ProductCard product={mockProduct} />);
        const card = screen.getByRole('article', {
            name: 'Test Product by Test Creator, price $99.90',
        });
        expect(card).not.toHaveAttribute('tabindex');
        expect(screen.queryByRole('button', { name: /test product/i })).not.toBeInTheDocument();
        expect(container.querySelector('details, summary')).toBeNull();
    });

    it('leaves untruncated fields out of Tab order without aria or tooltip DOM', async () => {
        const user = userEvent.setup();
        render(
            <>
                <button>Before</button>
                <ProductCard product={mockProduct} />
                <button>After</button>
            </>,
        );
        const { titleTrigger, creatorTrigger } = getElements();
        expectDisabled(titleTrigger);
        expectDisabled(creatorTrigger);
        expect(screen.queryByRole('tooltip')).toBeNull();

        screen.getByRole('button', { name: 'Before' }).focus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    });

    it.each(['title', 'creator', 'both'])('enables %s truncation independently', (field) => {
        render(<ProductCard product={longProduct} />);
        const { title, creator, titleTrigger, creatorTrigger } = getElements(longProduct);
        if (field === 'title' || field === 'both') setWidth(title, 180);
        if (field === 'creator' || field === 'both') setWidth(creator, 180);
        remeasure();

        if (field === 'title' || field === 'both') {
            expectEnabled(titleTrigger, longProduct.title);
        } else expectDisabled(titleTrigger);
        if (field === 'creator' || field === 'both') {
            expectEnabled(creatorTrigger, longProduct.creator);
        } else expectDisabled(creatorTrigger);
        if (field === 'both') {
            expect(titleTrigger.getAttribute('aria-describedby')).not.toBe(
                creatorTrigger.getAttribute('aria-describedby'),
            );
        }
    });

    it('remeasures text changes and closes a tooltip that becomes untruncated', () => {
        const { rerender } = render(<ProductCard product={longProduct} />);
        const { title, titleTrigger } = getElements(longProduct);
        setWidth(title, 180);
        remeasure();
        act(() => titleTrigger.focus());
        expect(getTooltip(titleTrigger)?.className).toMatch(/tooltipVisible/);

        setWidth(title, 20);
        rerender(<ProductCard product={{ ...longProduct, title: 'Short' }} />);
        const shortTrigger = screen.getByRole('heading', { name: 'Short' }).parentElement!;
        expectDisabled(shortTrigger);
        expect(screen.queryByRole('tooltip')).toBeNull();

        setWidth(shortTrigger.firstElementChild!, 180);
        rerender(<ProductCard product={{ ...longProduct, title: 'Long title returns again' }} />);
        expectEnabled(
            screen.getByRole('heading', { name: 'Long title returns again' }).parentElement!,
            'Long title returns again',
        );
    });

    it('enables and disables truncation from ResizeObserver measurements', () => {
        render(<ProductCard product={mockProduct} />);
        const { title, titleTrigger } = getElements();
        expectDisabled(titleTrigger);
        setWidth(title, 180);
        remeasure();
        expectEnabled(titleTrigger, mockProduct.title);
        setWidth(title, 20);
        remeasure();
        expectDisabled(titleTrigger);
    });

    it('remeasures when fonts finish loading', async () => {
        let resolveFonts!: () => void;
        fontSet.ready = new Promise<void>((resolve) => {
            resolveFonts = resolve;
        });
        render(<ProductCard product={mockProduct} />);
        const { title, titleTrigger } = getElements();
        expectDisabled(titleTrigger);
        setWidth(title, 180);
        await act(async () => {
            resolveFonts();
            await fontSet.ready;
        });
        expectEnabled(titleTrigger, mockProduct.title);
    });

    it('supports hover, pointer movement into tooltip, and coordinated leave', () => {
        render(<ProductCard product={longProduct} />);
        const { title, titleTrigger } = getElements(longProduct);
        setWidth(title, 180);
        remeasure();
        const region = titleTrigger.parentElement!;
        const tooltip = getTooltip(titleTrigger)!;
        fireEvent.mouseEnter(region);
        expect(tooltip.className).toMatch(/tooltipVisible/);
        fireEvent.mouseLeave(region, { relatedTarget: tooltip });
        expect(tooltip.className).toMatch(/tooltipVisible/);
        fireEvent.mouseLeave(region, { relatedTarget: document.body });
        expect(tooltip.className).not.toMatch(/tooltipVisible/);
    });

    it('closes on Escape without moving focus or immediately reopening', () => {
        const { container } = render(<ProductCard product={longProduct} />);
        const { title, titleTrigger } = getElements(longProduct);
        setWidth(title, 180);
        remeasure();
        act(() => titleTrigger.focus());
        const tooltip = getTooltip(titleTrigger)!;
        expect(tooltip.className).toMatch(/tooltipVisible/);

        fireEvent.keyDown(titleTrigger, { key: 'Escape' });
        expect(tooltip.className).not.toMatch(/tooltipVisible/);
        expect(titleTrigger).toHaveFocus();
        fireEvent.focus(titleTrigger);
        expect(tooltip.className).not.toMatch(/tooltipVisible/);
        expect(container.querySelector('button, details, summary, [aria-expanded]')).toBeNull();

        fireEvent.blur(titleTrigger);
        fireEvent.focus(titleTrigger);
        expect(tooltip.className).toMatch(/tooltipVisible/);
    });

    it('cleans observer, font listeners, and asynchronous font completion', async () => {
        let resolveFonts!: () => void;
        fontSet.ready = new Promise<void>((resolve) => {
            resolveFonts = resolve;
        });
        const { unmount } = render(<ProductCard product={mockProduct} />);
        expect(observe).toHaveBeenCalledTimes(4);
        expect(fontSet.addEventListener).toHaveBeenCalledWith('loadingdone', expect.any(Function));
        unmount();
        expect(disconnect).toHaveBeenCalledTimes(2);
        expect(fontSet.removeEventListener).toHaveBeenCalledTimes(2);
        await act(async () => {
            resolveFonts();
            await fontSet.ready;
        });
    });
});
