import { PricingOption, type Product, type SortMode } from '../types/product'

export interface CatalogQueryState {
  keyword: string
  pricingOptions: PricingOption[]
  sortMode: SortMode
}

export function filterProducts(products: Product[], query: CatalogQueryState): Product[] {
  const normalizedKeyword = query.keyword.trim().toLowerCase()

  return products.filter((product) => {
    const matchesKeyword =
      normalizedKeyword.length === 0 ||
      product.title.toLowerCase().includes(normalizedKeyword) ||
      product.creator.toLowerCase().includes(normalizedKeyword)

    const matchesPricing =
      query.pricingOptions.length === 0 || query.pricingOptions.includes(product.pricingOption)

    return matchesKeyword && matchesPricing
  })
}

export function sortProducts(products: Product[], sortMode: SortMode): Product[] {
  const list = [...products]

  // request not to consider secondary sorting for items with the same value
  switch (sortMode) {
    case 'price-desc':
      return list.sort((a, b) => b.price - a.price)
    case 'price-asc':
      return list.sort((a, b) => a.price - b.price)
    case 'title-asc':
      return list.sort((a, b) => a.title.localeCompare(b.title))
    case 'title-desc':
      return list.sort((a, b) => b.title.localeCompare(a.title))
    default:
      return list
  }
}

export function getVisibleProducts(products: Product[], visibleCount: number): Product[] {
  return products.slice(0, Math.max(visibleCount, 0))
}