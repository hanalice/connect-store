import { describe, expect, it } from 'vitest'

import { filterProducts, sortProducts } from './catalogSelectors'
import { PricingOption, type Product } from '../types/product'

const PRODUCTS: Product[] = [
  {
    id: 'p1',
    creator: 'Adam',
    title: 'Green Coat',
    pricingOption: PricingOption.PAID,
    imagePath: 'https://example.com/1.png',
    price: 20,
  },
  {
    id: 'p2',
    creator: 'Anisha',
    title: 'Black Heels',
    pricingOption: PricingOption.FREE,
    imagePath: 'https://example.com/2.png',
    price: 0,
  },
]

describe('catalog selectors', () => {
  it('filters by keyword and pricing options', () => {
    const result = filterProducts(PRODUCTS, {
      keyword: 'anisha',
      pricingOptions: [PricingOption.FREE],
      sortMode: 'default',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('p2')
  })

  it('sorts by price desc', () => {
    const result = sortProducts(PRODUCTS, 'price-desc')

    expect(result[0]?.id).toBe('p1')
    expect(result[1]?.id).toBe('p2')
  })
})