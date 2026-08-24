/**
 * Spec exécutable du helper de disponibilité produit.
 *
 * Ce repo n'a pas de framework de test (cf. docs/SMOKE_MULTITENANT.md), donc le
 * fichier s'auto-exécute et sort en code 1 au premier échec :
 *   npx tsx src/lib/__tests__/product-availability.test.ts
 *
 * Le cas qui compte vraiment est le fuseau : le serveur tourne en UTC, donc un
 * helper qui lirait l'heure locale du process déclarerait le menu de midi
 * fermé pendant tout le service. Les instants ci-dessous sont écrits en UTC
 * (le "Z") et attendus interprétés à Bruxelles.
 */

import {
  decrireSchedule,
  estDansSaPlage,
  momentBelge,
  normaliserSchedule,
  produitVendable,
} from '../product-availability'

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

const MENU_MIDI = {
  days: [1, 2, 3, 4, 5],
  slots: [{ start: '11:30', end: '14:00' }],
  from: '2026-08-31',
  until: null,
}

// ── fuseau ────────────────────────────────────────────────────────────────
// 2026-09-01 10:00Z = 12h00 à Bruxelles (heure d'été, UTC+2) : en plein service.
verifie('midi belge alors qu\'il est 10h UTC',
  estDansSaPlage(MENU_MIDI, new Date('2026-09-01T10:00:00Z')), true)

// 2026-09-01 09:00Z = 11h00 à Bruxelles : avant 11h30, fermé.
verifie('11h belge, avant l\'ouverture du créneau',
  estDansSaPlage(MENU_MIDI, new Date('2026-09-01T09:00:00Z')), false)

// 2026-12-01 10:00Z = 11h00 à Bruxelles (heure d'hiver, UTC+1) : fermé.
// Le même instant UTC bascule d'un côté à l'autre de la règle selon la saison :
// c'est exactement ce qu'un calcul en UTC raterait.
verifie('changement d\'heure : 10h UTC en décembre = 11h belge',
  estDansSaPlage(MENU_MIDI, new Date('2026-12-01T10:00:00Z')), false)

verifie('décembre, 11h UTC = 12h belge',
  estDansSaPlage(MENU_MIDI, new Date('2026-12-01T11:00:00Z')), true)

// ── bornes du créneau ─────────────────────────────────────────────────────
verifie('11h30 pile : ouvert (borne incluse)',
  estDansSaPlage(MENU_MIDI, new Date('2026-09-01T09:30:00Z')), true)

verifie('14h00 pile : fermé (borne exclue)',
  estDansSaPlage(MENU_MIDI, new Date('2026-09-01T12:00:00Z')), false)

verifie('13h59 : encore ouvert',
  estDansSaPlage(MENU_MIDI, new Date('2026-09-01T11:59:00Z')), true)

// ── jours ─────────────────────────────────────────────────────────────────
// 2026-09-05 est un samedi, 2026-09-06 un dimanche.
verifie('samedi midi : hors jours autorisés',
  estDansSaPlage(MENU_MIDI, new Date('2026-09-05T10:00:00Z')), false)

verifie('dimanche midi : hors jours autorisés',
  estDansSaPlage(MENU_MIDI, new Date('2026-09-06T10:00:00Z')), false)

verifie('vendredi midi : dans les jours autorisés',
  estDansSaPlage(MENU_MIDI, new Date('2026-09-04T10:00:00Z')), true)

// ── date de début ─────────────────────────────────────────────────────────
verifie('avant la date de lancement, même un lundi midi',
  estDansSaPlage(MENU_MIDI, new Date('2026-08-24T10:00:00Z')), false)

verifie('le jour du lancement à midi',
  estDansSaPlage(MENU_MIDI, new Date('2026-08-31T10:00:00Z')), true)

verifie('date de fin dépassée',
  estDansSaPlage({ ...MENU_MIDI, until: '2026-09-01' }, new Date('2026-09-02T10:00:00Z')), false)

// ── règles absentes ou mal formées : jamais bloquant ───────────────────────
verifie('null = toujours disponible', estDansSaPlage(null), true)
verifie('objet vide = toujours disponible', estDansSaPlage({}), true)
verifie('tableau = ignoré', estDansSaPlage([1, 2, 3]), true)
verifie('jour hors bornes ignoré, règle vidée donc permanente',
  estDansSaPlage({ days: [0, 9] }, new Date('2026-09-05T10:00:00Z')), true)
verifie('plage inversée ignorée',
  normaliserSchedule({ slots: [{ start: '14:00', end: '11:30' }] }), null)

// ── jours sans plage, plage sans jours ────────────────────────────────────
// 20:00Z = 22h belge, encore lundi. À 22:00Z on serait déjà mardi 00h00.
verifie('jours seuls : toute la journée du lundi',
  estDansSaPlage({ days: [1] }, new Date('2026-08-31T20:00:00Z')), true)
verifie('jours seuls : minuit fait basculer au mardi',
  estDansSaPlage({ days: [1] }, new Date('2026-08-31T22:00:00Z')), false)
verifie('plage seule : tous les jours entre 11h30 et 14h',
  estDansSaPlage({ slots: [{ start: '11:30', end: '14:00' }] }, new Date('2026-09-06T10:00:00Z')), true)

// ── deux plages dans la journée ───────────────────────────────────────────
const MIDI_ET_SOIR = { slots: [{ start: '11:30', end: '14:00' }, { start: '17:00', end: '21:30' }] }
verifie('entre les deux services : fermé',
  estDansSaPlage(MIDI_ET_SOIR, new Date('2026-09-01T13:00:00Z')), false)
verifie('service du soir : ouvert',
  estDansSaPlage(MIDI_ET_SOIR, new Date('2026-09-01T17:00:00Z')), true)

// ── combinaison avec is_available ─────────────────────────────────────────
verifie('en rupture pendant son créneau : invendable',
  produitVendable({ is_available: false, availability_schedule: MENU_MIDI },
    new Date('2026-09-01T10:00:00Z')), false)
verifie('disponible pendant son créneau : vendable',
  produitVendable({ is_available: true, availability_schedule: MENU_MIDI },
    new Date('2026-09-01T10:00:00Z')), true)
verifie('produit sans règle et non en rupture : vendable',
  produitVendable({ is_available: true }, new Date('2026-09-05T22:00:00Z')), true)

// ── minuit ────────────────────────────────────────────────────────────────
// 2026-08-30T22:00:00Z = lundi 31 à 00h00 belge : le jour ISO doit avoir basculé.
verifie('minuit belge = jour suivant',
  momentBelge(new Date('2026-08-30T22:00:00Z')).isoDay, 1)
verifie('minuit belge = 0 minute',
  momentBelge(new Date('2026-08-30T22:00:00Z')).minutes, 0)

// ── libellés ──────────────────────────────────────────────────────────────
verifie('libellé du menu de midi',
  decrireSchedule(MENU_MIDI), 'du lundi au vendredi de 11:30 à 14:00 à partir du 2026-08-31')
verifie('libellé sans règle', decrireSchedule(null), 'Disponible en permanence')
verifie('libellé jours non contigus',
  decrireSchedule({ days: [1, 3, 5] }), 'lundi, mercredi, vendredi')

console.log(echecs === 0 ? '\nTous les tests passent.' : `\n${echecs} test(s) en échec.`)
if (echecs > 0) process.exit(1)
