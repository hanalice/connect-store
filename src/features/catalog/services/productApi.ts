import type { Product } from '../types/product'

const PRODUCTS_API_URL = 'https://closet-recruiting-api.azurewebsites.net/api/data'
const MAX_RETRIES = 3

/**
 * Validates a product object contains all required fields.
 */
function isValidProduct(item: any): item is Product {
  return (
    item &&
    typeof item.id === 'string' &&
    typeof item.creator === 'string' &&
    typeof item.title === 'string' &&
    typeof item.pricingOption === 'number' &&
    typeof item.imagePath === 'string'
  )
}

export async function getProducts(): Promise<Product[]> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(PRODUCTS_API_URL)

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status} (Attempt ${attempt}/${MAX_RETRIES})`)
      }

      const data = await response.json()

      if (!Array.isArray(data)) {
        throw new Error('API response is not an array')
      }

      // Filter out malformed items
      return data.filter((item, index) => {
        const valid = isValidProduct(item)
        if (!valid) {
          console.warn(`Filtering out malformed product at index ${index}`, item)
        }
        return valid
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // If we've reached max retries, don't wait, just throw
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 500
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError || new Error('Unknown error during fetch')
}
