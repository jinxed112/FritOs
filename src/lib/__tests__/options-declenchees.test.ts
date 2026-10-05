/**
 * Spec exécutable des options déclenchées :
 *   npx tsx src/lib/__tests__/options-declenchees.test.ts
 *
 * Cas réel de Boussu : catégorie Hamburger = Sauce gratuites (1),
 * Accompagnement (2) dont « FRITE supplément » déclenche Sauce gratuites.
 */

import { groupesARetirer, groupesDeclenches } from '../options-declenchees'

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

const accompagnement = { id: 'accomp', option_group_items: [{ id: 'frite', triggers_option_group_id: 'sauce' }] }

verifie('hamburger, pas de frite : la sauce du burger reste', groupesARetirer(accompagnement, [{ item_id: 'andalouse' }], ['sauce', 'accomp']), [])
verifie('hamburger, frite prise : rien à retirer', groupesARetirer(accompagnement, [{ item_id: 'frite' }], ['sauce', 'accomp']), [])
verifie('smashburger (sauce pas dans ses étapes), pas de frite : la sauce déclenchée part', groupesARetirer(accompagnement, [], ['accomp']), ['sauce'])
verifie('smashburger, frite prise : la sauce est déclenchée', groupesDeclenches(accompagnement, [{ item_id: 'frite' }]), ['sauce'])

const menu = { id: 'menu', option_group_items: [{ id: 'menu-item', triggers_option_group_id: 'boisson-menu' }] }
verifie('menu refusé : le choix de boisson part', groupesARetirer(menu, [], ['sauce', 'accomp', 'menu']), ['boisson-menu'])
verifie('menu pris : boisson déclenchée', groupesDeclenches(menu, [{ item_id: 'menu-item' }]), ['boisson-menu'])

if (echecs > 0) {
  console.error(`\n${echecs} échec(s)`)
  process.exit(1)
}
console.log('\nTout est vert.')
