/**
 * Spec exécutable des codes promo à la borne :
 *   npx tsx src/lib/__tests__/promo.test.ts
 */

import { montantRemise, normaliserCode, refusPromoBorne, repartirRemise, type Promo } from '../promo'

let echecs = 0

function verifie(intitule: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) {
    echecs++
    console.error(`✗ ${intitule}\n    attendu : ${JSON.stringify(attendu)}\n    obtenu  : ${JSON.stringify(obtenu)}`)
  } else {
    console.log(`✓ ${intitule}`)
  }
}

const MAINTENANT = new Date('2026-11-28T18:00:00Z')

function code(extra: Partial<Promo> = {}): Promo {
  return {
    id: 'p1',
    code: 'BORNE10',
    discount_type: 'percentage',
    discount_value: 10,
    minimum_purchase: 0,
    valid_channels: ['kiosk'],
    start_date: null,
    end_date: null,
    usage_limit: null,
    usage_count: 0,
    ...extra,
  }
}

// ── Saisie ──
verifie('saisie : majuscules et espaces retirés', normaliserCode(' borne 10 '), 'BORNE10')
verifie('saisie : valeur absente', normaliserCode(undefined), '')

// ── Montant ──
verifie('10 % de 23,50 €', montantRemise(code(), 23.5), 2.35)
verifie('10 % de 12,35 € arrondi au centime', montantRemise(code(), 12.35), 1.24)
verifie('5 € fixes', montantRemise(code({ discount_type: 'fixed_amount', discount_value: 5 }), 23.5), 5)
verifie('montant fixe plafonné au panier', montantRemise(code({ discount_type: 'fixed_amount', discount_value: 5 }), 3.8), 3.8)
verifie('type inconnu : pas de remise', montantRemise(code({ discount_type: 'free_delivery', discount_value: 4 }), 20), 0)

// ── Canaux ──
verifie('code borne accepté', refusPromoBorne(code(), 20, MAINTENANT), null)
verifie('code sans canal : valable partout', refusPromoBorne(code({ valid_channels: null }), 20, MAINTENANT), null)
verifie('code en ligne + borne accepté', refusPromoBorne(code({ valid_channels: ['pickup', 'delivery', 'kiosk'] }), 20, MAINTENANT), null)
verifie(
  'code réservé à la commande en ligne refusé',
  refusPromoBorne(code({ valid_channels: ['pickup', 'delivery'] }), 20, MAINTENANT),
  'Ce code n\'est pas valable à la borne',
)
verifie(
  'livraison offerte refusée à la borne',
  refusPromoBorne(code({ discount_type: 'free_delivery' }), 20, MAINTENANT),
  'Ce code n\'est pas valable à la borne',
)

// ── Dates et limites ──
verifie('pas encore actif', refusPromoBorne(code({ start_date: '2026-12-01T00:00:00Z' }), 20, MAINTENANT), 'Ce code n\'est pas encore actif')
verifie('expiré', refusPromoBorne(code({ end_date: '2026-11-27T23:00:00Z' }), 20, MAINTENANT), 'Ce code a expiré')
verifie('limite atteinte', refusPromoBorne(code({ usage_limit: 1, usage_count: 1 }), 20, MAINTENANT), 'Ce code a déjà été utilisé')
verifie('limite non atteinte', refusPromoBorne(code({ usage_limit: 2, usage_count: 1 }), 20, MAINTENANT), null)
verifie('sous le minimum', refusPromoBorne(code({ minimum_purchase: 25 }), 20, MAINTENANT), 'Minimum de commande : 25.00 €')
verifie('au minimum', refusPromoBorne(code({ minimum_purchase: 25 }), 25, MAINTENANT), null)
verifie(
  'remise qui couvre tout le panier refusée',
  refusPromoBorne(code({ discount_type: 'fixed_amount', discount_value: 5 }), 3.8, MAINTENANT),
  'Ce code couvre toute la commande : présentez-le au comptoir',
)
verifie(
  '100 % refusé',
  refusPromoBorne(code({ discount_value: 100 }), 12, MAINTENANT),
  'Ce code couvre toute la commande : présentez-le au comptoir',
)

// ── Répartition sur les lignes ──
const somme = (lignes: { line_total: number }[]) => Math.round(lignes.reduce((s, l) => s + l.line_total, 0) * 100) / 100

const panier = [
  { nom: 'Géant', line_total: 13.5, vat_rate: 6 },
  { nom: 'Frite', line_total: 3.8, vat_rate: 6 },
  { nom: 'Coca', line_total: 2.7, vat_rate: 6 },
]
const apres = repartirRemise(panier, 2)
verifie('répartition : la somme baisse exactement de la remise', somme(apres), 18)
verifie('répartition : au prorata', apres.map(l => l.line_total), [12.15, 3.42, 2.43])
verifie('répartition : les autres champs sont gardés', apres.map(l => l.nom), ['Géant', 'Frite', 'Coca'])
verifie('répartition : le panier d\'origine n\'est pas modifié', panier[0].line_total, 13.5)

// Trois lignes égales et 1 € à répartir : 0,33 × 3 = 0,99, le centime va sur une ligne
const egales = repartirRemise([{ line_total: 3 }, { line_total: 3 }, { line_total: 3 }], 1)
verifie('répartition : écart d\'arrondi absorbé', somme(egales), 8)

const sept = repartirRemise([{ line_total: 6.4 }, { line_total: 5.8 }, { line_total: 12.5 }, { line_total: 2.2 }], 2.69)
verifie('répartition : 10 % de 26,90 €', somme(sept), 24.21)

verifie('répartition : remise nulle, lignes inchangées', repartirRemise(panier, 0), panier)
verifie('répartition : remise plafonnée au total', somme(repartirRemise(panier, 50)), 0)

if (echecs > 0) {
  console.error(`\n${echecs} échec(s)`)
  process.exit(1)
}
console.log('\nTout passe.')
