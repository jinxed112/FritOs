// Disponibilité d'un produit par jour et par plage horaire.
//
// `is_available` dit si le produit est en rupture. Ce module dit s'il est dans
// sa plage de vente. Les deux se combinent en ET.
//
// ⚠️ Toutes les heures d'une règle sont des heures locales belges. Le serveur
// (Vercel) tourne en UTC : lire `new Date().getHours()` donnerait 10h alors
// qu'il est midi à Boussu, et le menu de midi ne serait jamais vendable. On
// passe donc systématiquement par Europe/Brussels, ce qui gère aussi le
// changement d'heure sans qu'on ait à y penser.

export type AvailabilitySlot = { start: string; end: string }

export type AvailabilitySchedule = {
  days?: number[] | null // ISO : 1 = lundi … 7 = dimanche
  slots?: AvailabilitySlot[] | null
  from?: string | null // 'YYYY-MM-DD' inclus
  until?: string | null // 'YYYY-MM-DD' inclus
}

const TIMEZONE = 'Europe/Brussels'

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

type MomentBelge = { date: string; minutes: number; isoDay: number }

// Découpe un instant en date + minutes + jour ISO, exprimés à Bruxelles.
// `en-CA` donne YYYY-MM-DD, ce qui se compare lexicographiquement.
export function momentBelge(now: Date = new Date()): MomentBelge {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now)

  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const heure = parseInt(get('hour'), 10)
  const minute = parseInt(get('minute'), 10)

  // 'short' en en-CA renvoie Sun..Sat ; on repasse en ISO 1=lundi.
  const index = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    // minuit rendu "24" par certains runtimes : ramené à 0 pour rester dans [0,1440[
    minutes: (heure % 24) * 60 + minute,
    isoDay: index >= 0 ? index + 1 : 1,
  }
}

function versMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

// Une règle vide ou mal formée ne doit pas rendre un produit invendable : on
// retombe sur le comportement historique (toujours disponible).
export function normaliserSchedule(brut: unknown): AvailabilitySchedule | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null
  const s = brut as AvailabilitySchedule
  const days = Array.isArray(s.days)
    ? s.days.filter(d => Number.isInteger(d) && d >= 1 && d <= 7)
    : []
  const slots = Array.isArray(s.slots)
    ? s.slots.filter(x => {
        if (!x || typeof x !== 'object') return false
        const d = versMinutes(String(x.start))
        const f = versMinutes(String(x.end))
        return d !== null && f !== null && d < f
      })
    : []
  const from = typeof s.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.from) ? s.from : null
  const until = typeof s.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.until) ? s.until : null

  if (!days.length && !slots.length && !from && !until) return null
  return { days, slots, from, until }
}

/** Le produit est-il dans sa plage de vente à cet instant ? */
export function estDansSaPlage(brut: unknown, now: Date = new Date()): boolean {
  const regle = normaliserSchedule(brut)
  if (!regle) return true

  const { date, minutes, isoDay } = momentBelge(now)

  if (regle.from && date < regle.from) return false
  if (regle.until && date > regle.until) return false
  if (regle.days?.length && !regle.days.includes(isoDay)) return false
  if (!regle.slots?.length) return true

  return regle.slots.some(({ start, end }) => {
    const d = versMinutes(start)!
    const f = versMinutes(end)!
    return minutes >= d && minutes < f
  })
}

/** `is_available` ET la plage horaire. C'est ce que doivent appeler les surfaces de vente. */
export function produitVendable(
  produit: { is_available?: boolean | null; availability_schedule?: unknown },
  now: Date = new Date()
): boolean {
  if (produit.is_available === false) return false
  return estDansSaPlage(produit.availability_schedule, now)
}

/** Phrase courte pour l'admin et pour le message d'erreur au client. */
export function decrireSchedule(brut: unknown): string {
  const regle = normaliserSchedule(brut)
  if (!regle) return 'Disponible en permanence'

  const morceaux: string[] = []

  if (regle.days?.length) {
    const tries = [...regle.days].sort((a, b) => a - b)
    const contigu = tries.every((d, i) => i === 0 || d === tries[i - 1] + 1)
    morceaux.push(
      tries.length === 7
        ? 'tous les jours'
        : contigu && tries.length > 2
          ? `du ${JOURS[tries[0] - 1]} au ${JOURS[tries[tries.length - 1] - 1]}`
          : tries.map(d => JOURS[d - 1]).join(', ')
    )
  }

  if (regle.slots?.length) {
    morceaux.push(
      'de ' + regle.slots.map(s => `${s.start} à ${s.end}`).join(' et de ')
    )
  }

  if (regle.from) morceaux.push(`à partir du ${regle.from}`)
  if (regle.until) morceaux.push(`jusqu'au ${regle.until}`)

  return morceaux.length ? morceaux.join(' ') : 'Disponible en permanence'
}
