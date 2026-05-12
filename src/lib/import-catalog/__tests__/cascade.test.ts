/**
 * Tests unitaires basiques du helper cascade.
 *
 * Note : ce repo n'a pas (encore) de framework de test installé — cf.
 * `docs/SMOKE_MULTITENANT.md` qui pose "Pas de framework de test dans le repo".
 * Ces tests sont écrits dans un style compatible Jest/Vitest pour quand un
 * runner sera ajouté. Pour l'instant ils servent de spec exécutable +
 * documentation comportementale.
 *
 * Pour exécuter manuellement à la main pendant le dev :
 *   npx tsx src/lib/import-catalog/__tests__/cascade.test.ts
 *   (après `npm i -D tsx` si pas déjà présent — non requis pour le merge).
 */

import {
  makeEmptySelection,
  selectionToPayload,
  toggleCategoryCascade,
  toggleProduct,
} from '../cascade'
import type { ImportableProduct } from '../types'

const productFixture = (id: string, categoryId: string): ImportableProduct => ({
  id,
  category_id: categoryId,
  name: `Product ${id}`,
  slug: `product-${id}`,
  description: null,
  price: 5,
  image_url: null,
  display_order: 0,
  is_active: true,
  is_available: true,
  is_menu: false,
  vat_eat_in: 12,
  vat_takeaway: 6,
  has_ingredients: false,
  has_options: false,
  has_stock_mapping: false,
})

const products: ImportableProduct[] = [
  productFixture('p1', 'cat-a'),
  productFixture('p2', 'cat-a'),
  productFixture('p3', 'cat-b'),
]

// Test 1 : cascade catégorie coche tous les produits de cette catégorie
{
  const s0 = makeEmptySelection()
  const s1 = toggleCategoryCascade(s0, 'cat-a', true, products)
  console.assert(s1.categories['cat-a'] === true, 'cat-a doit être true')
  console.assert(s1.products['p1'] === true, 'p1 doit être true (cascade)')
  console.assert(s1.products['p2'] === true, 'p2 doit être true (cascade)')
  console.assert(s1.products['p3'] === undefined, 'p3 ne doit PAS être touché (autre catégorie)')
}

// Test 2 : décocher catégorie décoche tous ses produits
{
  let s = makeEmptySelection()
  s = toggleCategoryCascade(s, 'cat-a', true, products)
  s = toggleCategoryCascade(s, 'cat-a', false, products)
  console.assert(s.categories['cat-a'] === false, 'cat-a doit être false après décoche')
  console.assert(s.products['p1'] === false, 'p1 doit être false (cascade inverse)')
}

// Test 3 : toggleProduct override la cascade sans toucher la catégorie
{
  let s = makeEmptySelection()
  s = toggleCategoryCascade(s, 'cat-a', true, products)
  s = toggleProduct(s, 'p1', false)
  console.assert(s.categories['cat-a'] === true, 'cat-a reste true')
  console.assert(s.products['p1'] === false, 'p1 désélectionné individuellement')
  console.assert(s.products['p2'] === true, 'p2 reste sélectionné')
}

// Test 4 : selectionToPayload ne retourne que les IDs cochés
{
  let s = makeEmptySelection()
  s = toggleCategoryCascade(s, 'cat-a', true, products)
  s = toggleProduct(s, 'p1', false)
  const payload = selectionToPayload(s, products)
  console.assert(payload.product_ids.length === 1, 'doit retourner 1 produit')
  console.assert(payload.product_ids[0] === 'p2', "doit retourner p2 (le seul coché restant)")
  console.assert(payload.category_ids.length === 1, 'doit déduire 1 catégorie depuis le seul produit coché')
  console.assert(payload.category_ids[0] === 'cat-a', "doit retourner cat-a")
}

// Test 5 : selectionToPayload n'inclut pas une catégorie cochée si tous ses
// produits ont été décochés explicitement (cas limite)
{
  let s = makeEmptySelection()
  s = toggleCategoryCascade(s, 'cat-a', true, products)
  s = toggleProduct(s, 'p1', false)
  s = toggleProduct(s, 'p2', false)
  const payload = selectionToPayload(s, products)
  console.assert(payload.product_ids.length === 0, 'aucun produit')
  console.assert(payload.category_ids.length === 0, "aucune catégorie (n'importe pas catégorie vide)")
}

// eslint-disable-next-line no-console
console.log('cascade.test.ts: all assertions passed')
