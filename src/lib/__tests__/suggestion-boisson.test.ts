/**
 * Spec exécutable de la suggestion de boisson :
 *   npx tsx src/lib/__tests__/suggestion-boisson.test.ts
 *
 * Les noms de catégories sont ceux de la base de Boussu (octobre 2026),
 * y compris l'espace final de « Mitraillette » et l'accent de « Bières ».
 */

import {
  estCategorieProposee,
  fautProposerBoisson,
} from '../suggestion-boisson'

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

verifie('un burger seul → proposer', fautProposerBoisson(['Smashburgers']), true)
verifie('mitraillette avec espace final → proposer', fautProposerBoisson(['Mitraillette ']), true)
verifie('pitta + frite + sauce → proposer', fautProposerBoisson(['Pitta', 'Frite', 'Sauces']), true)
verifie('pain → proposer', fautProposerBoisson(['Pains']), true)
verifie('burger + coca → ne pas proposer', fautProposerBoisson(['Smashburgers', 'Boissons']), false)
verifie('burger + bière → ne pas proposer', fautProposerBoisson(['Hamburger', 'Bières']), false)
verifie('menu étudiant (boisson comprise) → ne pas proposer', fautProposerBoisson(['Menu']), false)
verifie('frite + snack sans plat → ne pas proposer', fautProposerBoisson(['Frite', 'Snacks', 'Sauces']), false)
verifie('panier vide → ne pas proposer', fautProposerBoisson([]), false)
verifie('catégorie inconnue → ne pas proposer', fautProposerBoisson([null, undefined]), false)
verifie('Boissons est la catégorie proposée', estCategorieProposee('Boissons'), true)
verifie('Bières n\'est pas proposée', estCategorieProposee('Bières'), false)

if (echecs > 0) {
  console.error(`\n${echecs} échec(s)`)
  process.exit(1)
}
console.log('\nTout est vert.')
