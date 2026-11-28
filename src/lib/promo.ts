/**
 * Codes promo à la borne.
 *
 * Les règles sont celles du site de commande (OrderMdj, src/lib/promo.ts) :
 * dates, limite d'utilisation, minimum de commande, canaux. Deux différences
 * propres à la borne :
 *
 * - le canal s'appelle « kiosk ». Un code n'est accepté que si la liste
 *   `valid_channels` est vide ou contient « kiosk » : les codes créés pour la
 *   commande en ligne (« pickup », « delivery ») ne passent pas à la borne tant
 *   qu'on ne l'a pas coché dans le back-office ;
 * - la borne ne connaît pas le client (pas de téléphone) : la limite « par
 *   client » ne peut pas y être vérifiée. Seule la limite globale s'applique.
 *
 * La remise est ensuite répartie sur les lignes de la commande, au prorata :
 * le rapport Z et les rapports lisent la TVA ligne par ligne, la somme des
 * lignes doit donc rester égale au montant encaissé.
 */

export const CANAL_BORNE = 'kiosk'

export type Promo = {
  id: string
  code: string
  discount_type: string
  discount_value: number
  minimum_purchase: number | null
  valid_channels: string[] | null
  start_date: string | null
  end_date: string | null
  usage_limit: number | null
  usage_count: number | null
}

const arrondi = (x: number) => Math.round(x * 100) / 100

/** Ce que le client tape : majuscules, sans espaces. */
export function normaliserCode(saisie: unknown): string {
  return typeof saisie === 'string' ? saisie.toUpperCase().replace(/\s+/g, '') : ''
}

export function montantRemise(promo: Pick<Promo, 'discount_type' | 'discount_value'>, sousTotal: number): number {
  const valeur = Number(promo.discount_value) || 0
  if (promo.discount_type === 'percentage') return arrondi(sousTotal * valeur / 100)
  if (promo.discount_type === 'fixed_amount') return arrondi(Math.min(valeur, sousTotal))
  return 0
}

/** Renvoie le motif du refus à la borne, ou null si le code s'applique. */
export function refusPromoBorne(promo: Promo, sousTotal: number, maintenant: Date = new Date()): string | null {
  const canaux = promo.valid_channels || []
  if (canaux.length > 0 && !canaux.includes(CANAL_BORNE)) {
    return 'Ce code n\'est pas valable à la borne'
  }
  if (promo.discount_type !== 'percentage' && promo.discount_type !== 'fixed_amount') {
    return 'Ce code n\'est pas valable à la borne'
  }
  if (promo.start_date && new Date(promo.start_date) > maintenant) return 'Ce code n\'est pas encore actif'
  if (promo.end_date && new Date(promo.end_date) < maintenant) return 'Ce code a expiré'
  if (promo.usage_limit && (promo.usage_count || 0) >= promo.usage_limit) {
    return 'Ce code a déjà été utilisé'
  }
  const minimum = Number(promo.minimum_purchase) || 0
  if (minimum > 0 && sousTotal < minimum) {
    return `Minimum de commande : ${minimum.toFixed(2)} €`
  }
  // Le terminal ne sait pas encaisser 0 € : il doit rester quelque chose à payer.
  if (arrondi(sousTotal - montantRemise(promo, sousTotal)) <= 0) {
    return 'Ce code couvre toute la commande : présentez-le au comptoir'
  }
  return null
}

/**
 * Répartit la remise sur les lignes, au prorata de leur montant. La somme des
 * lignes baisse exactement de `remise`, au centime : l'écart d'arrondi va sur
 * la plus grosse ligne. Le prix unitaire n'est pas touché (c'est le prix carte).
 */
export function repartirRemise<T extends { line_total: number }>(lignes: T[], remise: number): T[] {
  const total = arrondi(lignes.reduce((s, l) => s + Number(l.line_total), 0))
  const aRetirer = arrondi(Math.min(Math.max(remise, 0), total))
  if (aRetirer <= 0 || total <= 0) return lignes

  const parts = lignes.map(l => arrondi(aRetirer * Number(l.line_total) / total))
  const ecart = arrondi(aRetirer - parts.reduce((s, p) => s + p, 0))
  if (ecart !== 0) {
    let plusGrosse = 0
    lignes.forEach((l, i) => { if (Number(l.line_total) > Number(lignes[plusGrosse].line_total)) plusGrosse = i })
    parts[plusGrosse] = arrondi(parts[plusGrosse] + ecart)
  }
  return lignes.map((l, i) => ({ ...l, line_total: arrondi(Number(l.line_total) - parts[i]) }))
}
