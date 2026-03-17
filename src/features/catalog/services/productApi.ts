import type { Product } from '../types/product';

const PRODUCTS_API_URL = 'https://closet-recruiting-api.azurewebsites.net/api/data';
const MAX_RETRIES = 3;

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

export async function getProducts(): Promise<Product[]> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(PRODUCTS_API_URL);

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
            return data.filter((item, index) => {
                const valid = isValidProduct(item);
                if (!valid) {
                    console.error(`Malformed product data at index ${index}:`, item);
                }
                return valid;
            });
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
