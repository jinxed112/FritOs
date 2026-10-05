/**
 * Suggestion « Une boisson avec ça ? » avant le paiement (borne et portail).
 *
 * Mesuré en septembre 2026 à Boussu : 71 % des commandes du soir à la borne
 * contenant un plat repartent sans boisson (89 % en ligne). On propose donc
 * une boisson au moment de payer, une seule fois par commande, et seulement
 * quand le panier contient un plat et aucune boisson.
 *
 * Les règles se lisent sur le NOM de la catégorie (pas d'id en dur) pour
 * rester valables sur les deux sites. Ce module est recopié tel quel dans
 * OrderMdj (repo séparé) : toute modification doit y être répercutée.
 */

// Catégories qui font un « plat ». Le Menu étudiant n'en fait pas partie :
// sa boisson est déjà comprise.
const CATEGORIES_PLAT = ['smashburger', 'mitraillette', 'hamburger', 'pitta', 'pain', 'plateau']

// Catégories qui comptent comme « boisson » déjà prise (le menu en contient une).
const CATEGORIES_BOISSON = ['boisson', 'biere', 'menu']

// Seules les boissons sans alcool sont proposées.
const CATEGORIE_PROPOSEE = 'boisson'

export function normaliserCategorie(nom: string | null | undefined): string {
  return (nom ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export function estCategoriePlat(nom: string | null | undefined): boolean {
  const n = normaliserCategorie(nom)
  return CATEGORIES_PLAT.some(c => n.startsWith(c))
}

export function estCategorieBoisson(nom: string | null | undefined): boolean {
  const n = normaliserCategorie(nom)
  return CATEGORIES_BOISSON.some(c => n.startsWith(c))
}

export function estCategorieProposee(nom: string | null | undefined): boolean {
  return normaliserCategorie(nom).startsWith(CATEGORIE_PROPOSEE)
}

/**
 * Faut-il proposer une boisson ?
 * `categoriesDuPanier` = nom de catégorie de chaque ligne du panier.
 */
export function fautProposerBoisson(categoriesDuPanier: (string | null | undefined)[]): boolean {
  const avecPlat = categoriesDuPanier.some(estCategoriePlat)
  const avecBoisson = categoriesDuPanier.some(estCategorieBoisson)
  return avecPlat && !avecBoisson
}
