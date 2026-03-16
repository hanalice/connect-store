import type { Product } from '../types/product'

const PRODUCTS_API_URL = 'https://closet-recruiting-api.azurewebsites.net/api/data'

export async function getProducts(): Promise<Product[]> {
  const response = await fetch(PRODUCTS_API_URL)

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  const data = (await response.json()) as Product[]
  return Array.isArray(data) ? data : []
}