// Business rules for the AOV nudges. Tweak these to tune the demo.
export const FREE_DELIVERY_THRESHOLD = 399
export const DELIVERY_FEE = 49
export const COD_FEE = 19
export const COD_FREE_ABOVE = 499
export const BUNDLE_DISCOUNT_PCT = 12
// distinct items in cart -> % off (non-bundle lines)
export const TIER_DISCOUNTS = [
  { items: 3, pct: 10 },
  { items: 2, pct: 5 },
]
// quantity of one SKU -> % off that line (reseller packs)
export const PACK_DISCOUNTS = [
  { qty: 5, pct: 15 },
  { qty: 3, pct: 8 },
]
export const RESELL_MARKUP = 1.35

// BNPL plans (offered by a partner bank)
export const BNPL = {
  payLaterMin: 199,
  pay3Min: 499,
  weeklyMin: 399,
  weeklyFee: 9,
  emiMin: 999,
  emiRate: 16,
  emiMonths: 6,
}

// "Complete the look" pairing by subcategory
export const COMPLEMENTS = {
  Sarees: ['Jewellery', 'Women Footwear', 'Handbags'],
  Lehengas: ['Jewellery', 'Women Footwear', 'Dupattas'],
  Dupattas: ['Tops & Kurtis', 'Jewellery', 'Women Footwear'],
  'Western Wear': ['Handbags', 'Women Footwear', 'Sunglasses', 'Jewellery'],
  Dresses: ['Jewellery', 'Women Footwear', 'Handbags', 'Makeup'],
  'Tops & Kurtis': ['Dupattas', 'Jewellery', 'Women Footwear', 'Handbags'],
  Shirts: ['Men Footwear', 'Watches', 'Wallets', 'Sunglasses'],
  'T-shirts': ['Men Footwear', 'Wallets', 'Sunglasses', 'Backpacks'],
  Jackets: ['T-shirts', 'Men Footwear', 'Backpacks'],
  Jewellery: ['Sarees', 'Tops & Kurtis', 'Dresses', 'Makeup'],
  Watches: ['Shirts', 'Wallets', 'Fragrances'],
  Wallets: ['Shirts', 'Watches', 'Men Footwear'],
  Sunglasses: ['Shirts', 'Watches', 'Western Wear'],
  Handbags: ['Dresses', 'Women Footwear', 'Makeup', 'Western Wear'],
  Backpacks: ['T-shirts', 'Mobile Accessories', 'Men Footwear'],
  'Women Footwear': ['Sarees', 'Dresses', 'Handbags', 'Tops & Kurtis'],
  'Men Footwear': ['Shirts', 'T-shirts', 'Wallets', 'Fitness'],
  Makeup: ['Skin Care', 'Fragrances', 'Jewellery'],
  Fragrances: ['Makeup', 'Watches', 'Skin Care'],
  'Skin Care': ['Makeup', 'Fragrances'],
  Kitchen: ['Kitchen', 'Home Decor'],
  'Home Decor': ['Home Decor', 'Kitchen'],
  'Mobile Accessories': ['Mobile Accessories', 'Backpacks', 'Fitness'],
  Fitness: ['Men Footwear', 'T-shirts', 'Mobile Accessories'],
}

// Diwali 2026 is on 8 November
export const FESTIVAL = { name: 'Diwali', date: '2026-11-08', uplift: 1.3 }
