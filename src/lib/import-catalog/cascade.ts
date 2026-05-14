/**
 * Helper de cascade catégorie → produits pour la modal d'import.
 *
 * Brief Michele 09/05 (Q1 verrouillée) : cocher une catégorie coche par défaut
 * TOUS ses produits ; décocher la catégorie ne touche pas les produits déjà
 * cochés explicitement par l'utilisateur (laissé pur — on ne propage la
 * décoche que dans le cas du toggle direct depuis la checkbox catégorie).
 *
 * Ce module est volontairement pur (pas de React, pas d'IO) pour être testable
 * unitairement.
 */

import type { ImportSelection, ImportableProduct } from './types'

export function makeEmptySelection(): ImportSelection {
  return { categories: {}, products: {}, optionGroups: {} }
}

/**
 * Applique le toggle d'une checkbox catégorie. Si `checked === true`, coche
 * tous les produits de la catégorie (cascade). Si `checked === false`, décoche
 * tous les produits de la catégorie (cascade inverse).
 *
 * Retourne une NOUVELLE selection (immutable) pour cohérence avec React.
 */
export function toggleCategoryCascade(
  selection: ImportSelection,
  categoryId: string,
  checked: boolean,
  products: ImportableProduct[]
): ImportSelection {
  const next: ImportSelection = {
    categories: { ...selection.categories, [categoryId]: checked },
    products: { ...selection.products },
    optionGroups: { ...selection.optionGroups },
  }
  for (const p of products) {
    if (p.category_id === categoryId) {
      next.products[p.id] = checked
    }
  }
  return next
}

/**
 * Toggle d'un produit individuel (icône ✓/⊕ par produit). Ne modifie pas la
 * checkbox catégorie — l'utilisateur peut très bien avoir une catégorie cochée
 * avec 1 produit explicitement décoché à l'intérieur.
 */
export function toggleProduct(
  selection: ImportSelection,
  productId: string,
  checked: boolean
): ImportSelection {
  return {
    ...selection,
    products: { ...selection.products, [productId]: checked },
  }
}

export function toggleOptionGroup(
  selection: ImportSelection,
  optionGroupId: string,
  checked: boolean
): ImportSelection {
  return {
    ...selection,
    optionGroups: { ...selection.optionGroups, [optionGroupId]: checked },
  }
}

/**
 * Retourne le sous-ensemble effectif à envoyer aux server actions.
 * On envoie uniquement les IDs explicitement cochés ; la liste des catégories
 * cochées n'est utile que pour l'UI — côté serveur on déduit les catégories
 * à créer à partir des `category_id` des produits cochés (évite d'importer
 * une catégorie vide si l'utilisateur a tout décoché à l'intérieur).
 */
export function selectionToPayload(
  selection: ImportSelection,
  products: ImportableProduct[]
): {
  product_ids: string[]
  category_ids: string[]
  option_group_ids: string[]
} {
  const product_ids = Object.entries(selection.products)
    .filter(([, v]) => v)
    .map(([k]) => k)

  // Déduire les catégories à importer depuis les produits cochés (pas depuis
  // selection.categories — un user peut cocher une catégorie puis décocher
  // tous ses produits ; dans ce cas on n'importe pas la catégorie vide).
  const category_ids = Array.from(
    new Set(
      products
        .filter((p) => product_ids.includes(p.id))
        .map((p) => p.category_id)
    )
  )

  const option_group_ids = Object.entries(selection.optionGroups)
    .filter(([, v]) => v)
    .map(([k]) => k)

  return { product_ids, category_ids, option_group_ids }
}
