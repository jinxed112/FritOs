/**
 * Ventilation TVA du menu « frite + boisson » (+4,50 € sur un plat).
 *
 * Le menu est une option du plat : la frite et la boisson voyagent dans
 * `options_selected` de la ligne du plat, qui ne porte qu'UN taux de TVA.
 * À emporter tout est à 6 %, mais sur place la frite est à 12 % et la
 * boisson à 21 %. Le rapport Z et les factures lisent le taux par ligne :
 * la boisson doit donc sortir en ligne à part, à son propre taux.
 *
 * Répartition au prorata des prix normaux (frite en accompagnement 2,20 €,
 * boisson 2,70 € au 05/10/2026) : sur 4,50 €, frite 2,02 € et boisson 2,48 €.
 * La somme de la commande ne change pas, au centime.
 *
 * On ventile sur les lignes `order_items` prêtes à insérer, pour que les cinq
 * points d'entrée (borne, caisse, caisse smartphone, API commande, OrderMdj)
 * partagent le même code. Copie conforme dans OrderMdj : toute modification
 * doit être répercutée dans les deux repos.
 */

import { normaliserCategorie } from './suggestion-boisson'

export type LigneCommande = {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  vat_rate: number
  options_selected: string | null
  options_total: number
  line_total: number
  [autre: string]: unknown
}

export type BoissonMenu = {
  id: string
  name: string
  price: number // prix carte de la boisson seule, sert au prorata
  vat_rate: number // taux déjà choisi selon sur place / à emporter
}

export type ContexteVentilation = {
  boisson: (nom: string) => BoissonMenu | undefined
  prixFrite: number // prix carte de la frite en accompagnement (FRITE supplément)
}

// Prix de la frite en accompagnement au 05/10/2026, si le produit est introuvable
export const PRIX_FRITE_PAR_DEFAUT = 2.2

type OptionStockee = { option_group_name?: string; item_name?: string; price?: number; [k: string]: unknown }

const arrondi = (x: number) => Math.round(x * 100) / 100

function estGroupeMenu(nom: unknown): boolean {
  return normaliserCategorie(typeof nom === 'string' ? nom : '') === 'menu'
}

function estGroupeBoissonDuMenu(nom: unknown): boolean {
  return normaliserCategorie(typeof nom === 'string' ? nom : '') === 'boisson du menu'
}

/** Part du prix du menu qui revient à la boisson. */
export function partBoisson(prixMenu: number, prixBoisson: number, prixFrite: number): number {
  if (prixBoisson <= 0 || prixMenu <= 0) return 0
  return arrondi(prixMenu * prixBoisson / (prixBoisson + Math.max(0, prixFrite)))
}

/** Une ligne de plat passée en menu → [plat, boisson] ; toute autre ligne → [ligne]. */
export function ventilerLigne<T extends LigneCommande>(ligne: T, ctx: ContexteVentilation): T[] {
  if (!ligne.options_selected) return [ligne]
  let options: OptionStockee[]
  try {
    const lu = JSON.parse(ligne.options_selected)
    if (!Array.isArray(lu)) return [ligne]
    options = lu
  } catch {
    return [ligne]
  }

  const menu = options.find(o => estGroupeMenu(o.option_group_name) && Number(o.price) > 0)
  const choix = options.find(o => estGroupeBoissonDuMenu(o.option_group_name))
  if (!menu || !choix || typeof choix.item_name !== 'string') return [ligne]

  const boisson = ctx.boisson(choix.item_name)
  if (!boisson) return [ligne]

  const prixMenu = Number(menu.price)
  const part = partBoisson(prixMenu, boisson.price, ctx.prixFrite)
  if (part <= 0) return [ligne]

  const optionsPlat = options
    .filter(o => o !== choix)
    .map(o => (o === menu ? { ...o, price: arrondi(prixMenu - part) } : o))
  const optionsTotal = arrondi(Number(ligne.options_total) - part)

  const plat: T = {
    ...ligne,
    options_selected: JSON.stringify(optionsPlat),
    options_total: optionsTotal,
    line_total: arrondi((Number(ligne.unit_price) + optionsTotal) * ligne.quantity),
  }
  const ligneBoisson: T = {
    ...ligne,
    product_id: boisson.id,
    product_name: `${boisson.name} (menu)`,
    unit_price: part,
    vat_rate: boisson.vat_rate,
    options_selected: null,
    options_total: 0,
    line_total: arrondi(part * ligne.quantity),
    notes: null,
  }
  // OrderMdj renseigne category_name : ne pas laisser celle du plat sur la boisson
  if ('category_name' in ligne) (ligneBoisson as LigneCommande).category_name = null
  return [plat, ligneBoisson]
}

export function ventilerLignes<T extends LigneCommande>(lignes: T[], ctx: ContexteVentilation): T[] {
  return lignes.flatMap(l => ventilerLigne(l, ctx))
}

/** Taxe totale d'un ensemble de lignes (prix TTC, taux par ligne). */
export function taxeDesLignes(lignes: LigneCommande[]): number {
  const t = lignes.reduce((s, l) => s + Number(l.line_total) * Number(l.vat_rate) / (100 + Number(l.vat_rate)), 0)
  return arrondi(t)
}

/**
 * Contexte construit depuis la liste des produits chargée par l'écran.
 * `estBoisson` dit si un produit est une boisson proposable dans le menu.
 */
export function contexteDepuisProduits<P extends { id: string; name: string; price: number; vat_eat_in?: number | null; vat_takeaway?: number | null }>(
  produits: P[],
  surPlace: boolean,
  estBoisson: (p: P) => boolean,
): ContexteVentilation {
  const frite = produits.find(p => normaliserCategorie(p.name) === 'frite supplement')
  return {
    prixFrite: frite ? Number(frite.price) : PRIX_FRITE_PAR_DEFAUT,
    boisson: (nom: string) => {
      const p = produits.find(x => x.name === nom && estBoisson(x))
      if (!p) return undefined
      const taux = surPlace ? (p.vat_eat_in ?? 21) : (p.vat_takeaway ?? 6)
      return { id: p.id, name: p.name, price: Number(p.price), vat_rate: Number(taux) }
    },
  }
}
