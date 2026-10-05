/**
 * Groupes d'options déclenchés (ex. « FRITE supplément » → choix de la sauce).
 *
 * Quand on quitte une étape, les groupes que ses choix déclenchent sont
 * insérés juste après, et ceux qu'ils ne déclenchent plus (changement d'avis)
 * sont retirés avec leurs choix. MAIS un groupe qui fait déjà partie des
 * étapes normales du produit ne doit jamais être retiré : « Sauce gratuites »
 * est à la fois l'étape sauce d'un hamburger et le groupe déclenché par la
 * frite en accompagnement. Sans cette garde, passer l'étape Accompagnement
 * sans frite effaçait la sauce du burger (caisse, du 24/09 au 05/10/2026 :
 * 7 hamburgers/pains sur 49 avec sauce, contre 142 sur 152 avant).
 */

type Item = { id: string; triggers_option_group_id: string | null }
type Groupe = { id: string; option_group_items: Item[] }
type Choix = { item_id: string }

/** Groupes déclenchés par les choix faits dans `groupe`. */
export function groupesDeclenches(groupe: Groupe, choix: Choix[]): string[] {
  return groupe.option_group_items
    .filter(i => i.triggers_option_group_id && choix.some(o => o.item_id === i.id))
    .map(i => i.triggers_option_group_id as string)
}

/**
 * Groupes à retirer en quittant `groupe` : ceux qu'il peut déclencher, qu'il
 * ne déclenche pas, et qui ne sont pas des étapes de base du produit.
 */
export function groupesARetirer(groupe: Groupe, choix: Choix[], groupesDeBase: string[]): string[] {
  const declenches = groupesDeclenches(groupe, choix)
  return groupe.option_group_items
    .map(i => i.triggers_option_group_id)
    .filter((id): id is string => !!id && !declenches.includes(id) && !groupesDeBase.includes(id))
}
