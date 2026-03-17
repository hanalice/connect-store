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

  // request not to consider secondary sorting for items with the same value, 
  // but I still think the secondary sorting is necessary,otherwise each time the 
  // order of items with the same value will be different, which is not good for user experience
  switch (sortMode) {
    case 'price-desc':
      return list.sort((a, b) => {
        // Priority: PAID (0) > FREE (1) > VIEW_ONLY (2)
        if (a.pricingOption !== b.pricingOption) {
          return a.pricingOption - b.pricingOption
        }

        // Within PAID category, sort by price DESC
        if (a.pricingOption === PricingOption.PAID) {
          if (b.price !== a.price) {
            return b.price - a.price
          }
        }

        // Fallback to title A-Z
        return a.title.localeCompare(b.title)
      })

    case 'price-asc':
      return list.sort((a, b) => {
        // Priority: VIEW_ONLY (2) > FREE (1) > PAID (0)
        if (a.pricingOption !== b.pricingOption) {
          return b.pricingOption - a.pricingOption
        }

        // Within PAID category, sort by price ASC
        if (a.pricingOption === PricingOption.PAID) {
          if (a.price !== b.price) {
            return a.price - b.price
          }
        }

        // Fallback to title A-Z
        return a.title.localeCompare(b.title)
      })

    case 'default':
    default:
      return list.sort((a, b) => a.title.localeCompare(b.title))
  }
}

export function getVisibleProducts(products: Product[], visibleCount: number): Product[] {
  return products.slice(0, Math.max(visibleCount, 0))
}