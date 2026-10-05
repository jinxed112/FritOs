/**
 * Spec exécutable de la ventilation TVA du menu :
 *   npx tsx src/lib/__tests__/menu-ventilation.test.ts
 *
 * Prix de la carte de Boussu au 05/10/2026 : SmokySmash 12,50, menu +4,50,
 * frite en accompagnement 2,20, Coca 2,70 (6 % à emporter, 21 % sur place).
 */

import {
  partBoisson,
  taxeDesLignes,
  ventilerLignes,
  type ContexteVentilation,
  type LigneCommande,
} from '../menu-ventilation'

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

const options = [
  { option_group_id: 'g1', option_group_name: 'Menu', item_id: 'i1', item_name: 'MENU frite + boisson', price: 4.5 },
  { option_group_id: 'g2', option_group_name: 'Boisson du menu', item_id: 'i2', item_name: 'Coca-cola 33cl', price: 0 },
  { option_group_id: 'g3', option_group_name: 'Sauce gratuites', item_id: 'i3', item_name: '2.Andalouse', price: 0 },
]

function ligneMenu(quantite: number, taux: number): LigneCommande {
  return {
    order_id: 'o1',
    product_id: 'smoky',
    product_name: 'SmokySmash',
    quantity: quantite,
    unit_price: 12.5,
    vat_rate: taux,
    options_selected: JSON.stringify(options),
    options_total: 4.5,
    line_total: 17 * quantite,
  }
}

const ctx = (surPlace: boolean): ContexteVentilation => ({
  prixFrite: 2.2,
  boisson: nom => (nom === 'Coca-cola 33cl' ? { id: 'coca', name: 'Coca-cola 33cl', price: 2.7, vat_rate: surPlace ? 21 : 6 } : undefined),
})

verifie('part boisson sur 4,50 € = 2,48 €', partBoisson(4.5, 2.7, 2.2), 2.48)

// Sur place : plat 12 %, boisson 21 %
const surPlace = ventilerLignes([ligneMenu(1, 12)], ctx(true))
verifie('sur place : deux lignes', surPlace.length, 2)
verifie('sur place : plat à 12 %', [surPlace[0].product_name, surPlace[0].vat_rate, surPlace[0].line_total, surPlace[0].options_total], ['SmokySmash', 12, 14.52, 2.02])
verifie('sur place : boisson à 21 %', [surPlace[1].product_name, surPlace[1].product_id, surPlace[1].vat_rate, surPlace[1].unit_price, surPlace[1].line_total], ['Coca-cola 33cl (menu)', 'coca', 21, 2.48, 2.48])
verifie('sur place : total inchangé au centime', Math.round((surPlace[0].line_total + surPlace[1].line_total) * 100) / 100, 17)
verifie('sur place : la boisson sort des options du plat', JSON.parse(surPlace[0].options_selected!).map((o: any) => o.item_name), ['MENU frite + boisson', '2.Andalouse'])
verifie('sur place : l\'option menu vaut 2,02 €', JSON.parse(surPlace[0].options_selected!)[0].price, 2.02)
verifie('sur place : la ligne boisson garde l\'id de commande', surPlace[1].order_id, 'o1')
// TVA : 14,52 × 12/112 + 2,48 × 21/121 = 1,5557 + 0,4304 = 1,99
verifie('sur place : TVA totale', taxeDesLignes(surPlace), 1.99)

// Quantité 2
const deux = ventilerLignes([ligneMenu(2, 12)], ctx(true))
verifie('quantité 2 : boisson × 2', [deux[1].quantity, deux[1].line_total], [2, 4.96])
verifie('quantité 2 : total 34 €', Math.round((deux[0].line_total + deux[1].line_total) * 100) / 100, 34)

// À emporter : tout à 6 %, la TVA ne bouge pas
const emporter = ventilerLignes([ligneMenu(1, 6)], ctx(false))
verifie('à emporter : boisson à 6 %', emporter[1].vat_rate, 6)
verifie('à emporter : même TVA qu\'avant ventilation', taxeDesLignes(emporter), taxeDesLignes([ligneMenu(1, 6)]))

const avecCategorie = ventilerLignes([{ ...ligneMenu(1, 6), category_name: 'Smashburgers' }], ctx(false))
verifie('category_name du plat pas recopiée sur la boisson', [avecCategorie[0].category_name, avecCategorie[1].category_name], ['Smashburgers', null])
verifie('ligne sans category_name : pas de champ ajouté', 'category_name' in surPlace[1], false)

// Lignes non concernées
const simple: LigneCommande = { product_id: 'p', product_name: 'Frite', quantity: 1, unit_price: 3.8, vat_rate: 6, options_selected: null, options_total: 0, line_total: 3.8 }
verifie('ligne sans option : intacte', ventilerLignes([simple], ctx(false)), [simple])
const fritePlusSauce = { ...ligneMenu(1, 6), options_selected: JSON.stringify([{ option_group_name: 'Accompagnement ', item_name: 'FRITE supplément', price: 2.2 }]), options_total: 2.2, line_total: 14.7 }
verifie('frite en supplément sans menu : intacte', ventilerLignes([fritePlusSauce], ctx(false)).length, 1)
verifie('boisson introuvable : ligne laissée telle quelle', ventilerLignes([ligneMenu(1, 12)], { prixFrite: 2.2, boisson: () => undefined }).length, 1)
verifie('JSON illisible : ligne laissée telle quelle', ventilerLignes([{ ...simple, options_selected: '{oups' }], ctx(false)).length, 1)

if (echecs > 0) {
  console.error(`\n${echecs} échec(s)`)
  process.exit(1)
}
console.log('\nTout est vert.')
