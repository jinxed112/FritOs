/**
 * Calcul HTVA / TVA pour une liste de commandes.
 *
 * Les commandes en DB sont stockées avec `total` TTC.
 * Pour la facture B2B, on doit reverse-calculer HT et TVA par taux.
 *
 * Taux applicables Horeca Belgique (CP 302) :
 *   - eat_in   → TVA 12 %
 *   - autres   → TVA  6 % (takeaway, delivery, pickup)
 *
 * Référence : Art. 1er, §2 AR n°20 — restauration sur place vs à emporter.
 */

export type InvoiceOrderInput = {
  id: string
  order_number: string
  order_type: string
  total: number // TTC
  created_at: string
}

export type InvoiceTotals = {
  total_ht: number
  vat_6: number
  vat_12: number
  total_ttc: number
}

const VAT_RATE_EAT_IN = 0.12
const VAT_RATE_TAKEAWAY = 0.06

/**
 * Round to 2 decimals (avoid floating-point weirdness).
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcule le breakdown HT / TVA d'un ensemble de commandes.
 * On part du `total` TTC stocké en DB et on reverse-calcule.
 */
export function calculateInvoiceTotals(orders: InvoiceOrderInput[]): InvoiceTotals {
  let total_ht = 0
  let vat_6 = 0
  let vat_12 = 0
  let total_ttc = 0

  for (const order of orders) {
    const ttc = Number(order.total) || 0
    total_ttc += ttc

    const rate = order.order_type === 'eat_in' ? VAT_RATE_EAT_IN : VAT_RATE_TAKEAWAY

    // TTC = HT × (1 + rate), donc HT = TTC / (1 + rate), TVA = TTC − HT
    const ht = ttc / (1 + rate)
    const vat = ttc - ht
    total_ht += ht

    if (rate === VAT_RATE_EAT_IN) {
      vat_12 += vat
    } else {
      vat_6 += vat
    }
  }

  return {
    total_ht: round2(total_ht),
    vat_6: round2(vat_6),
    vat_12: round2(vat_12),
    total_ttc: round2(total_ttc),
  }
}
