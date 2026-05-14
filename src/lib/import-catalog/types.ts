/**
 * Types partagés entre l'UI d'import (`/admin/import`) et les server actions
 * (`app/actions/import-catalog.ts`).
 *
 * Conçu pour rester source-agnostic : l'utilisateur sélectionne un
 * `source_establishment_id` dans l'UI, ce n'est jamais hardcodé "Boussu".
 */

export type ImportableCategory = {
  id: string
  name: string
  slug: string
  display_order: number
  is_active: boolean
  visible_on_kiosk: boolean
  image_url: string | null
  product_count: number
}

export type ImportableProduct = {
  id: string
  category_id: string
  name: string
  slug: string
  description: string | null
  price: number
  image_url: string | null
  display_order: number
  is_active: boolean
  is_available: boolean
  is_menu: boolean
  vat_eat_in: number
  vat_takeaway: number
  has_ingredients: boolean
  has_options: boolean
  has_stock_mapping: boolean
}

export type ImportableOptionGroup = {
  id: string
  name: string
  selection_type: string
  display_order: number
  is_active: boolean
}

/**
 * État de sélection construit dans l'UI :
 *  - `categories[catId] = true` : la catégorie est cochée → cascade par défaut
 *    sur tous ses produits (logique implémentée côté UI helper).
 *  - `products[prodId]` : ✓ (true = importer) / ⊕ (false = ignorer).
 *  - `optionGroups[ogId]` : idem pour propositions, onglet séparé.
 *
 * Quand `categories[catId]` passe à true, l'UI doit setter à true tous les
 * `products[prodId]` dont `category_id === catId` — sauf si l'utilisateur a
 * explicitement désélectionné un produit après la coche cascade.
 */
export type ImportSelection = {
  categories: Record<string, boolean>
  products: Record<string, boolean>
  optionGroups: Record<string, boolean>
}

export type ImportPreview = {
  categories: ImportableCategory[]
  products: ImportableProduct[]
  optionGroups: ImportableOptionGroup[]
}

export type ImportConflict = {
  type: 'category_slug' | 'product_slug' | 'option_group_name'
  source_id: string
  source_name: string
  conflicting_slug_or_name: string
}

export type ImportResult = {
  success: boolean
  inserted: {
    categories: number
    products: number
    product_ingredients: number
    product_option_groups: number
    product_stock_mapping: number
    option_groups: number
    ingredients: number
    stock_items: number
  }
  conflicts: ImportConflict[]
  errors: string[]
}
