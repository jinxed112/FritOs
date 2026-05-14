'use server'

/**
 * Server actions pour l'import de catalogue entre deux établissements.
 *
 * PR E du sprint multi-tenant — brief verrouillé Michele 09/05/2026 :
 *   - Cascade catégorie → produits par défaut côté UI
 *   - État ✓/⊕ par produit
 *   - Copie : categories, products, product_ingredients, product_option_groups,
 *     product_stock_mapping (+ dépendances : option_groups, ingredients,
 *     stock_items — sinon les FK target ne résolvent pas)
 *   - URL image partagée (pas de re-upload bucket)
 *   - Prix copiés tels quels
 *   - **NE PAS hardcoder "Boussu"** — l'établissement source vient en param
 *
 * Sécurité :
 *   - Authentifié obligatoire (`auth.getUser()`)
 *   - Rôle `super_admin` REQUIS (`profiles.establishment_id IS NULL`)
 *   - L'établissement target = établissement courant via cookie HMAC
 *     (`getCurrentEstablishment()`). Pas dans le body — anti-tampering.
 *
 * **TODO Michele (décisions ouvertes)** :
 *   - **Slug conflict** : actuellement REFUS + retour conflit. Alternative :
 *     suffix auto `-2`. À trancher.
 *   - **Prix** : copie identique. Alternative : prompt multiplicateur (+5%).
 *   - **Image** : URL partagée (pas de re-upload). Alternative : copie dans
 *     bucket dédié par tenant.
 */

import { z } from 'zod'
import {
  createServerSupabaseClient,
  createAdminClient,
} from '@/lib/supabase/server'
import { requireEstablishment } from '@/lib/establishment/server'
import type {
  ImportPreview,
  ImportResult,
  ImportConflict,
} from '@/lib/import-catalog/types'

const ImportPayloadSchema = z.object({
  source_establishment_id: z.string().uuid(),
  product_ids: z.array(z.string().uuid()),
  category_ids: z.array(z.string().uuid()),
  option_group_ids: z.array(z.string().uuid()),
})

export type ImportPayload = z.infer<typeof ImportPayloadSchema>

async function assertSuperAdmin(): Promise<{ userId: string }> {
  const supabase = createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    throw new Error('Action réservée aux super-admins')
  }
  if (profile.establishment_id !== null) {
    throw new Error(
      'Un super_admin doit avoir establishment_id=NULL (pin sur 1 site interdit)'
    )
  }
  return { userId: user.id }
}

/**
 * Charge l'aperçu du catalogue source. Lecture seule.
 * Retourne la liste des catégories/produits/option_groups que l'admin peut
 * cocher dans le modal.
 */
export async function loadImportPreview(
  sourceEstablishmentId: string
): Promise<ImportPreview> {
  await assertSuperAdmin()
  const target = await requireEstablishment()
  if (target.id === sourceEstablishmentId) {
    throw new Error("L'établissement source doit être différent de la cible")
  }

  const admin = createAdminClient()

  const { data: categories, error: catErr } = await admin
    .from('categories')
    .select('id, name, slug, display_order, is_active, visible_on_kiosk, image_url')
    .eq('establishment_id', sourceEstablishmentId)
    .order('display_order')
  if (catErr) throw new Error(`Lecture catégories source: ${catErr.message}`)

  const { data: products, error: prodErr } = await admin
    .from('products')
    .select(
      'id, category_id, name, slug, description, price, image_url, display_order, is_active, is_available, is_menu, vat_eat_in, vat_takeaway'
    )
    .eq('establishment_id', sourceEstablishmentId)
    .order('display_order')
  if (prodErr) throw new Error(`Lecture produits source: ${prodErr.message}`)

  const productIds = (products ?? []).map((p: { id: string }) => p.id)

  // Présence d'éventuelles dépendances par produit (pour l'affichage UI badge)
  const ingPresence = new Set<string>()
  const optPresence = new Set<string>()
  const stockPresence = new Set<string>()
  if (productIds.length > 0) {
    const [{ data: ings }, { data: opts }, { data: stocks }] = await Promise.all([
      admin
        .from('product_ingredients')
        .select('product_id')
        .in('product_id', productIds),
      admin
        .from('product_option_groups')
        .select('product_id')
        .in('product_id', productIds),
      admin
        .from('product_stock_mapping')
        .select('product_id')
        .in('product_id', productIds),
    ])
    ;(ings ?? []).forEach((r: { product_id: string }) => ingPresence.add(r.product_id))
    ;(opts ?? []).forEach((r: { product_id: string }) => optPresence.add(r.product_id))
    ;(stocks ?? []).forEach((r: { product_id: string }) =>
      stockPresence.add(r.product_id)
    )
  }

  const { data: optionGroups, error: ogErr } = await admin
    .from('option_groups')
    .select('id, name, selection_type, display_order, is_active')
    .eq('establishment_id', sourceEstablishmentId)
    .order('display_order')
  if (ogErr) throw new Error(`Lecture option_groups source: ${ogErr.message}`)

  const productCountByCat = new Map<string, number>()
  for (const p of products ?? []) {
    productCountByCat.set(
      p.category_id,
      (productCountByCat.get(p.category_id) ?? 0) + 1
    )
  }

  return {
    categories: (categories ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      display_order: c.display_order,
      is_active: c.is_active,
      visible_on_kiosk: c.visible_on_kiosk,
      image_url: c.image_url,
      product_count: productCountByCat.get(c.id) ?? 0,
    })),
    products: (products ?? []).map((p: any) => ({
      id: p.id,
      category_id: p.category_id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: Number(p.price),
      image_url: p.image_url,
      display_order: p.display_order,
      is_active: p.is_active,
      is_available: p.is_available,
      is_menu: p.is_menu,
      vat_eat_in: Number(p.vat_eat_in),
      vat_takeaway: Number(p.vat_takeaway),
      has_ingredients: ingPresence.has(p.id),
      has_options: optPresence.has(p.id),
      has_stock_mapping: stockPresence.has(p.id),
    })),
    optionGroups: (optionGroups ?? []).map((o: any) => ({
      id: o.id,
      name: o.name,
      selection_type: o.selection_type,
      display_order: o.display_order,
      is_active: o.is_active,
    })),
  }
}

/**
 * Exécute l'import effectif : copie depuis source vers target (= establishment
 * courant).
 *
 * Ordre des INSERT (FK-safe) :
 *   1. categories
 *   2. products
 *   3. product_ingredients (avec import préalable des `ingredients` parents
 *      pas encore présents côté target)
 *   4. product_stock_mapping (avec import préalable des `stock_items`)
 *   5. product_option_groups (avec import préalable des `option_groups` cochés
 *      explicitement par l'utilisateur dans l'onglet "Propositions")
 *
 * **TODO Michele** : aujourd'hui on importe à la demande les dépendances
 * (ingredients, stock_items) en silencieux. Voulez-vous une UI dédiée pour les
 * sélectionner explicitement ? Décision MVP : import auto = plus simple.
 *
 * Stratégie conflit (TODO à confirmer) : **refus** sur conflit de slug.
 * On retourne `ImportResult.conflicts` listant ce qui n'a pas été copié.
 */
export async function executeImport(
  rawPayload: unknown
): Promise<ImportResult> {
  await assertSuperAdmin()
  const target = await requireEstablishment()
  const payload = ImportPayloadSchema.parse(rawPayload)

  if (payload.source_establishment_id === target.id) {
    throw new Error("Source ≠ cible obligatoire")
  }

  const admin = createAdminClient()
  const conflicts: ImportConflict[] = []
  const errors: string[] = []
  const inserted: ImportResult['inserted'] = {
    categories: 0,
    products: 0,
    product_ingredients: 0,
    product_option_groups: 0,
    product_stock_mapping: 0,
    option_groups: 0,
    ingredients: 0,
    stock_items: 0,
  }

  // ─── Step 1: catégories ───────────────────────────────────────────────
  const categoryIdMap = new Map<string, string>() // source_cat_id → target_cat_id

  if (payload.category_ids.length > 0) {
    const { data: sourceCats, error: srcCatErr } = await admin
      .from('categories')
      .select('*')
      .in('id', payload.category_ids)
      .eq('establishment_id', payload.source_establishment_id)
    if (srcCatErr) {
      errors.push(`Read source categories: ${srcCatErr.message}`)
      return { success: false, inserted, conflicts, errors }
    }

    // Slugs déjà pris côté target
    const { data: existingCats } = await admin
      .from('categories')
      .select('id, slug')
      .eq('establishment_id', target.id)
      .in(
        'slug',
        (sourceCats ?? []).map((c: { slug: string }) => c.slug)
      )
    const takenSlugs = new Set(
      (existingCats ?? []).map((c: { slug: string }) => c.slug)
    )

    const toInsertCats = (sourceCats ?? []).filter((c: any) => {
      if (takenSlugs.has(c.slug)) {
        conflicts.push({
          type: 'category_slug',
          source_id: c.id,
          source_name: c.name,
          conflicting_slug_or_name: c.slug,
        })
        return false
      }
      return true
    })

    if (toInsertCats.length > 0) {
      const { data: insertedCats, error: insCatErr } = await admin
        .from('categories')
        .insert(
          toInsertCats.map((c: any) => ({
            establishment_id: target.id,
            name: c.name,
            slug: c.slug,
            description: c.description,
            image_url: c.image_url,
            display_order: c.display_order,
            is_active: c.is_active,
            visible_on_kiosk: c.visible_on_kiosk,
          }))
        )
        .select('id, slug')
      if (insCatErr) {
        errors.push(`Insert categories: ${insCatErr.message}`)
        return { success: false, inserted, conflicts, errors }
      }
      inserted.categories = insertedCats?.length ?? 0
      // Mapper source → target par slug (unique par tenant)
      const targetBySlug = new Map<string, string>(
        (insertedCats ?? []).map((c: any) => [c.slug as string, c.id as string])
      )
      for (const src of toInsertCats) {
        const tgt = targetBySlug.get(src.slug as string)
        if (tgt) categoryIdMap.set(src.id as string, tgt)
      }
    }
  }

  // ─── Step 2: produits ─────────────────────────────────────────────────
  const productIdMap = new Map<string, string>()

  if (payload.product_ids.length > 0) {
    const { data: sourceProds, error: srcProdErr } = await admin
      .from('products')
      .select('*')
      .in('id', payload.product_ids)
      .eq('establishment_id', payload.source_establishment_id)
    if (srcProdErr) {
      errors.push(`Read source products: ${srcProdErr.message}`)
      return { success: false, inserted, conflicts, errors }
    }

    const slugsToCheck = (sourceProds ?? []).map((p: { slug: string }) => p.slug)
    const { data: existingProds } = await admin
      .from('products')
      .select('slug')
      .eq('establishment_id', target.id)
      .in('slug', slugsToCheck.length > 0 ? slugsToCheck : [''])
    const takenProdSlugs = new Set(
      (existingProds ?? []).map((p: { slug: string }) => p.slug)
    )

    const toInsertProds = (sourceProds ?? []).filter((p: any) => {
      if (takenProdSlugs.has(p.slug)) {
        conflicts.push({
          type: 'product_slug',
          source_id: p.id,
          source_name: p.name,
          conflicting_slug_or_name: p.slug,
        })
        return false
      }
      // Si la catégorie n'a pas pu être créée (conflit), skip aussi le produit
      if (!categoryIdMap.has(p.category_id)) {
        // Peut arriver si une catégorie pré-existait déjà côté target.
        // **TODO Michele** : voulez-vous dans ce cas réutiliser la catégorie
        // existante côté target plutôt que skip ? Pour MVP : skip + signal.
        conflicts.push({
          type: 'category_slug',
          source_id: p.category_id,
          source_name: `(catégorie parente de ${p.name})`,
          conflicting_slug_or_name: 'category_not_imported',
        })
        return false
      }
      return true
    })

    if (toInsertProds.length > 0) {
      const { data: insertedProds, error: insProdErr } = await admin
        .from('products')
        .insert(
          toInsertProds.map((p: any) => ({
            establishment_id: target.id,
            category_id: categoryIdMap.get(p.category_id)!,
            name: p.name,
            slug: p.slug,
            description: p.description,
            image_url: p.image_url,
            price: p.price,
            vat_eat_in: p.vat_eat_in,
            vat_takeaway: p.vat_takeaway,
            cost_price: p.cost_price,
            display_order: p.display_order,
            is_available: p.is_available,
            is_active: p.is_active,
            is_menu: p.is_menu,
            menu_config: p.menu_config,
            preparation_time: p.preparation_time,
            allergens_override: p.allergens_override,
            tags: p.tags,
          }))
        )
        .select('id, slug')
      if (insProdErr) {
        errors.push(`Insert products: ${insProdErr.message}`)
        return { success: false, inserted, conflicts, errors }
      }
      inserted.products = insertedProds?.length ?? 0
      const targetProdBySlug = new Map<string, string>(
        (insertedProds ?? []).map((p: any) => [p.slug as string, p.id as string])
      )
      for (const src of toInsertProds) {
        const tgt = targetProdBySlug.get(src.slug as string)
        if (tgt) productIdMap.set(src.id as string, tgt)
      }
    }
  }

  // ─── Step 3: ingrédients + product_ingredients ─────────────────────────
  if (productIdMap.size > 0) {
    const sourceProductIds = Array.from(productIdMap.keys())
    const { data: pings, error: pingErr } = await admin
      .from('product_ingredients')
      .select('product_id, ingredient_id, is_essential, quantity, unit')
      .in('product_id', sourceProductIds)
    if (pingErr) {
      errors.push(`Read product_ingredients: ${pingErr.message}`)
    } else if (pings && pings.length > 0) {
      // Trouver les ingrédients sources distincts et matcher par nom côté target
      const sourceIngIds = Array.from(
        new Set(pings.map((r: any) => r.ingredient_id as string))
      )
      const { data: sourceIngs } = await admin
        .from('ingredients')
        .select('*')
        .in('id', sourceIngIds)
      const { data: targetIngs } = await admin
        .from('ingredients')
        .select('id, name')
        .eq('establishment_id', target.id)
      const targetIngByName = new Map<string, string>(
        (targetIngs ?? []).map((i: any) => [i.name as string, i.id as string])
      )
      const ingIdMap = new Map<string, string>() // source_ing → target_ing
      const ingsToCreate = (sourceIngs ?? []).filter((i: any) => {
        const existing = targetIngByName.get(i.name as string)
        if (existing) {
          ingIdMap.set(i.id as string, existing)
          return false
        }
        return true
      })
      if (ingsToCreate.length > 0) {
        const { data: newIngs, error: insIngErr } = await admin
          .from('ingredients')
          .insert(
            ingsToCreate.map((i: any) => ({
              establishment_id: target.id,
              name: i.name,
              category: i.category,
              unit: i.unit,
              stock_current: 0, // stock reset (chaque site gère le sien)
              stock_min: i.stock_min,
              // Pricing: schéma actuel utilise purchase_price/quantity/unit
              // (pas cost_per_unit qui n'existe pas). Cf incident 14/05.
              purchase_price: i.purchase_price,
              purchase_quantity: i.purchase_quantity,
              purchase_unit: i.purchase_unit,
              vat_rate: i.vat_rate,
              description: i.description,
              allergens: i.allergens,
              image_url: i.image_url,
              sku: i.sku,
              supplier_id: null, // FK fournisseur cross-tenant → null pour MVP
              is_available: i.is_available,
              is_active: i.is_active,
            }))
          )
          .select('id, name')
        if (insIngErr) {
          errors.push(`Insert ingredients: ${insIngErr.message}`)
        } else {
          inserted.ingredients = newIngs?.length ?? 0
          for (const newIng of newIngs ?? []) {
            const src = ingsToCreate.find((i: any) => i.name === newIng.name)
            if (src) ingIdMap.set(src.id, newIng.id)
          }
        }
      }

      // Insert product_ingredients en remappant les FK
      const pingRows = pings
        .map((r: any) => {
          const targetProd = productIdMap.get(r.product_id)
          const targetIng = ingIdMap.get(r.ingredient_id)
          if (!targetProd || !targetIng) return null
          return {
            product_id: targetProd,
            ingredient_id: targetIng,
            is_essential: r.is_essential,
            quantity: r.quantity,
            unit: r.unit,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      if (pingRows.length > 0) {
        const { error: insPingErr, count } = await admin
          .from('product_ingredients')
          .insert(pingRows, { count: 'exact' })
        if (insPingErr) {
          errors.push(`Insert product_ingredients: ${insPingErr.message}`)
        } else {
          inserted.product_ingredients = count ?? pingRows.length
        }
      }
    }
  }

  // ─── Step 4: stock_items + product_stock_mapping ───────────────────────
  // **TODO Michele** : ce step est best-effort. Le stock physique d'un nouveau
  // site ne devrait sans doute PAS être copié — chaque établissement gère son
  // propre stock. Mais le MAPPING produit→stock_item EST utile (sinon FritOS
  // Flexi/POS ne peut pas décrémenter le stock à la vente). Solution MVP :
  // créer des `stock_items` côté target avec stock_current=0 + mapping.
  if (productIdMap.size > 0) {
    const sourceProductIds = Array.from(productIdMap.keys())
    const { data: psms } = await admin
      .from('product_stock_mapping')
      .select('product_id, stock_item_id, portions_per_order')
      .in('product_id', sourceProductIds)
    if (psms && psms.length > 0) {
      const sourceStockIds = Array.from(
        new Set(psms.map((r: any) => r.stock_item_id as string))
      )
      const { data: sourceStocks } = await admin
        .from('stock_items')
        .select('*')
        .in('id', sourceStockIds)
      const { data: targetStocks } = await admin
        .from('stock_items')
        .select('id, name')
        .eq('establishment_id', target.id)
      const targetStockByName = new Map<string, string>(
        (targetStocks ?? []).map((s: any) => [s.name as string, s.id as string])
      )
      const stockIdMap = new Map<string, string>()
      const stocksToCreate = (sourceStocks ?? []).filter((s: any) => {
        const existing = targetStockByName.get(s.name as string)
        if (existing) {
          stockIdMap.set(s.id as string, existing)
          return false
        }
        return true
      })
      if (stocksToCreate.length > 0) {
        const { data: newStocks, error: insStockErr } = await admin
          .from('stock_items')
          .insert(
            stocksToCreate.map((s: any) => ({
              establishment_id: target.id,
              name: s.name,
              stock_type: s.stock_type,
              // Schéma actuel : gestion grammes pas portions/unités.
              // Colonnes is_active/unit/portions_per_unit/stock_current/
              // stock_min n'existent plus. Cf incident 14/05.
              pack_weight_g: s.pack_weight_g,
              portion_weight_g: s.portion_weight_g,
              dlc_days: s.dlc_days,
            }))
          )
          .select('id, name')
        if (insStockErr) {
          errors.push(`Insert stock_items: ${insStockErr.message}`)
        } else {
          inserted.stock_items = newStocks?.length ?? 0
          for (const newStock of newStocks ?? []) {
            const src = stocksToCreate.find((s: any) => s.name === newStock.name)
            if (src) stockIdMap.set(src.id, newStock.id)
          }
        }
      }

      const psmRows = psms
        .map((r: any) => {
          const targetProd = productIdMap.get(r.product_id)
          const targetStock = stockIdMap.get(r.stock_item_id)
          if (!targetProd || !targetStock) return null
          return {
            product_id: targetProd,
            stock_item_id: targetStock,
            portions_per_order: r.portions_per_order,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      if (psmRows.length > 0) {
        const { error: insPsmErr, count } = await admin
          .from('product_stock_mapping')
          .insert(psmRows, { count: 'exact' })
        if (insPsmErr) {
          errors.push(`Insert product_stock_mapping: ${insPsmErr.message}`)
        } else {
          inserted.product_stock_mapping = count ?? psmRows.length
        }
      }
    }
  }

  // ─── Step 5: option_groups + product_option_groups ─────────────────────
  // Onglet "Propositions" de l'UI — l'utilisateur coche les option_groups
  // qu'il veut importer en plus.
  const optionGroupIdMap = new Map<string, string>()

  if (payload.option_group_ids.length > 0) {
    const { data: sourceOgs } = await admin
      .from('option_groups')
      .select('*')
      .in('id', payload.option_group_ids)
      .eq('establishment_id', payload.source_establishment_id)

    const { data: targetOgs } = await admin
      .from('option_groups')
      .select('id, name')
      .eq('establishment_id', target.id)
    const targetOgByName = new Map<string, string>(
      (targetOgs ?? []).map((o: any) => [o.name as string, o.id as string])
    )

    const ogsToCreate = (sourceOgs ?? []).filter((o: any) => {
      const existing = targetOgByName.get(o.name as string)
      if (existing) {
        optionGroupIdMap.set(o.id as string, existing)
        conflicts.push({
          type: 'option_group_name',
          source_id: o.id,
          source_name: o.name,
          conflicting_slug_or_name: o.name,
        })
        return false
      }
      return true
    })

    if (ogsToCreate.length > 0) {
      const { data: newOgs, error: insOgErr } = await admin
        .from('option_groups')
        .insert(
          ogsToCreate.map((o: any) => ({
            establishment_id: target.id,
            name: o.name,
            description: o.description,
            selection_type: o.selection_type,
            min_selections: o.min_selections,
            max_selections: o.max_selections,
            display_order: o.display_order,
            is_active: o.is_active,
          }))
        )
        .select('id, name')
      if (insOgErr) {
        errors.push(`Insert option_groups: ${insOgErr.message}`)
      } else {
        inserted.option_groups = newOgs?.length ?? 0
        for (const newOg of newOgs ?? []) {
          const src = ogsToCreate.find((o: any) => o.name === newOg.name)
          if (src) optionGroupIdMap.set(src.id, newOg.id)
        }
      }
    }

    // **TODO Michele** : copier aussi `option_group_items` (qui pointent vers
    // des `products` source) ? Cas tricky : si l'item pointe vers un produit
    // qu'on a importé (productIdMap), on peut le remapper. Sinon skip.
    // Pour MVP, on copie ce qui est remappable.
    if (optionGroupIdMap.size > 0) {
      const { data: sourceItems } = await admin
        .from('option_group_items')
        .select('*')
        .in('option_group_id', Array.from(optionGroupIdMap.keys()))

      const itemRows = (sourceItems ?? [])
        .map((it: any) => {
          const tgtOg = optionGroupIdMap.get(it.option_group_id)
          if (!tgtOg) return null
          // option_group_items peut pointer un product_id : si oui, remapper
          // seulement si on a importé ce produit. Sinon ignorer (peut être
          // un standalone option sans produit lié).
          const tgtProd = it.product_id
            ? productIdMap.get(it.product_id) ?? null
            : null
          if (it.product_id && !tgtProd) return null
          return {
            option_group_id: tgtOg,
            // Schéma actuel : pas de name/description (items minimalistes).
            // price_modifier renommé price_override. Cf incident 14/05.
            price_override: it.price_modifier ?? it.price_override ?? null,
            product_id: tgtProd,
            display_order: it.display_order,
            is_default: it.is_default,
            is_active: it.is_active,
            max_quantity: it.max_quantity,
            triggers_option_group_id: it.triggers_option_group_id ?? null,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      if (itemRows.length > 0) {
        const { error: insItemErr } = await admin
          .from('option_group_items')
          .insert(itemRows)
        if (insItemErr) {
          errors.push(`Insert option_group_items: ${insItemErr.message}`)
        }
      }
    }
  }

  // Et finalement le lien products ↔ option_groups si les deux ont été
  // remappés. On ne crée le lien que pour les pog dont les deux côtés existent
  // côté target.
  if (productIdMap.size > 0) {
    const sourceProductIds = Array.from(productIdMap.keys())
    const { data: pogs } = await admin
      .from('product_option_groups')
      .select('product_id, option_group_id, display_order')
      .in('product_id', sourceProductIds)

    const pogRows = (pogs ?? [])
      .map((r: any) => {
        const tgtProd = productIdMap.get(r.product_id)
        const tgtOg = optionGroupIdMap.get(r.option_group_id)
        if (!tgtProd || !tgtOg) return null
        return {
          product_id: tgtProd,
          option_group_id: tgtOg,
          display_order: r.display_order,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (pogRows.length > 0) {
      const { error: insPogErr, count } = await admin
        .from('product_option_groups')
        .insert(pogRows, { count: 'exact' })
      if (insPogErr) {
        errors.push(`Insert product_option_groups: ${insPogErr.message}`)
      } else {
        inserted.product_option_groups = count ?? pogRows.length
      }
    }
  }

  return {
    success: errors.length === 0,
    inserted,
    conflicts,
    errors,
  }
}
