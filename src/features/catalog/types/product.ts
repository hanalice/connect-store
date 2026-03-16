export const PricingOption = {
  PAID: 0,
  FREE: 1,
  VIEW_ONLY: 2,
} as const

export type PricingOption = (typeof PricingOption)[keyof typeof PricingOption]

export interface Product {
  id: string
  creator: string
  title: string
  pricingOption: PricingOption
  imagePath: string
  price: number
}

export type SortMode = 'default' | 'price-desc' | 'price-asc' | 'title-asc' | 'title-desc'

export const PRICING_LABEL: Record<PricingOption, string> = {
  [PricingOption.PAID]: 'Paid',
  [PricingOption.FREE]: 'Free',
  [PricingOption.VIEW_ONLY]: 'View Only',
}