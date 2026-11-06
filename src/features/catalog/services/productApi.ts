import type { Product } from '../types/product';

const PRODUCTS_DATA_URL = `${import.meta.env.BASE_URL}data/products.json`;
const MAX_RETRIES = 3;

/**
 * Resolves relative image paths against the app base URL so mock assets
 * work both under GitHub Pages project subpaths and in local dev.
 * Absolute URLs (http/https/protocol-relative/root-relative) are kept as-is.
 */
function resolveImagePath(imagePath: string): string {
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(imagePath) || imagePath.startsWith('/')) {
        return imagePath;
    }
    return `${import.meta.env.BASE_URL}${imagePath}`;
}

/**
 * Validates a product object contains all required fields.
 */
function isValidProduct(item: unknown): item is Product {
    if (typeof item !== 'object' || item === null) return false;
    const p = item as Record<string, unknown>;
    return (
        typeof p.id === 'string' &&
        typeof p.creator === 'string' &&
        typeof p.title === 'string' &&
        typeof p.pricingOption === 'number' &&
        typeof p.imagePath === 'string'
    );
}

export async function getProducts(signal?: AbortSignal): Promise<Product[]> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(PRODUCTS_DATA_URL, { signal });

            if (!response.ok) {
                // Only retry for 5xx server errors
                if (response.status >= 500 && attempt < MAX_RETRIES) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
                    continue;
                }
                throw new Error(`Request failed with status ${response.status}`);
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error('API response is not an array');
            }

            // Filter out malformed items
            return data
                .filter((item, index) => {
                    const valid = isValidProduct(item);
                    if (!valid) {
                        console.error(`Malformed product data at index ${index}:`, item);
                    }
                    return valid;
                })
                .map((item) => ({ ...item, imagePath: resolveImagePath(item.imagePath) }));
        } catch (error) {
            // fetch() throws TypeError on network failures (e.g. DNS, connection loss)
            const isNetworkError = error instanceof TypeError;

            if (isNetworkError && attempt < MAX_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 500));
                continue;
            }

            // Re-throw if it's not a retryable error, or if we've exhausted retries
            throw error;
        }
    }

    throw new Error('All retry attempts failed');
}
