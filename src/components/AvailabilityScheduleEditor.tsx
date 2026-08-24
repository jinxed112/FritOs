'use client'

import { useMemo } from 'react'
import {
  decrireSchedule,
  estDansSaPlage,
  normaliserSchedule,
  type AvailabilitySchedule,
  type AvailabilitySlot,
} from '@/lib/product-availability'

// Éditeur de la règle « ce produit ne se vend qu'à certains moments ».
// Volontairement au-dessus de `is_available` dans le formulaire : le patron
// bascule `is_available` plusieurs fois par jour (rupture), il touche à cette
// règle-ci une fois quand il crée le produit.

const JOURS: { iso: number; court: string; long: string }[] = [
  { iso: 1, court: 'L', long: 'lundi' },
  { iso: 2, court: 'M', long: 'mardi' },
  { iso: 3, court: 'M', long: 'mercredi' },
  { iso: 4, court: 'J', long: 'jeudi' },
  { iso: 5, court: 'V', long: 'vendredi' },
  { iso: 6, court: 'S', long: 'samedi' },
  { iso: 7, court: 'D', long: 'dimanche' },
]

const RACCOURCIS: { nom: string; regle: AvailabilitySchedule }[] = [
  {
    nom: 'Midi en semaine',
    regle: { days: [1, 2, 3, 4, 5], slots: [{ start: '11:30', end: '14:00' }] },
  },
  {
    nom: 'Le soir',
    regle: { days: [1, 2, 3, 4, 5, 6, 7], slots: [{ start: '17:00', end: '21:30' }] },
  },
  {
    nom: 'Week-end',
    regle: { days: [6, 7], slots: [] },
  },
]

type Props = {
  value: unknown
  onChange: (valeur: AvailabilitySchedule | null) => void
}

export default function AvailabilityScheduleEditor({ value, onChange }: Props) {
  const regle = useMemo(() => normaliserSchedule(value), [value])
  const actif = regle !== null

  const jours = regle?.days ?? []
  const plages: AvailabilitySlot[] = regle?.slots?.length
    ? regle.slots
    : [{ start: '11:30', end: '14:00' }]

  const maj = (patch: Partial<AvailabilitySchedule>) =>
    onChange({
      days: regle?.days ?? [],
      slots: regle?.slots ?? [],
      from: regle?.from ?? null,
      until: regle?.until ?? null,
      ...patch,
    })

  const basculerJour = (iso: number) =>
    maj({ days: jours.includes(iso) ? jours.filter(j => j !== iso) : [...jours, iso].sort() })

  const majPlage = (index: number, champ: 'start' | 'end', valeur: string) =>
    maj({ slots: plages.map((p, i) => (i === index ? { ...p, [champ]: valeur } : p)) })

  const vendableMaintenant = actif && estDansSaPlage(regle, new Date())

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={actif}
          onChange={e => onChange(e.target.checked ? RACCOURCIS[0].regle : null)}
          className="w-5 h-5 rounded"
        />
        <span className="font-medium">Disponible seulement à certains moments</span>
      </label>

      {!actif ? (
        <p className="text-sm text-gray-500">
          Le produit est vendable à toute heure, tant qu&apos;il n&apos;est pas en rupture.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {RACCOURCIS.map(r => (
              <button
                key={r.nom}
                type="button"
                onClick={() => onChange(r.regle)}
                className="px-3 py-1.5 text-sm rounded-full border border-gray-300 hover:bg-gray-50"
              >
                {r.nom}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Jours</label>
            <div className="flex gap-2">
              {JOURS.map(j => {
                const coche = jours.includes(j.iso)
                return (
                  <button
                    key={j.iso}
                    type="button"
                    title={j.long}
                    onClick={() => basculerJour(j.iso)}
                    className={`w-10 h-10 rounded-full text-sm font-bold transition-colors ${
                      coche
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {j.court}
                  </button>
                )
              })}
            </div>
            {jours.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">Aucun jour coché = tous les jours.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Heures</label>
            <div className="space-y-2">
              {plages.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={p.start}
                    onChange={e => majPlage(i, 'start', e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200"
                  />
                  <span className="text-gray-400">à</span>
                  <input
                    type="time"
                    value={p.end}
                    onChange={e => majPlage(i, 'end', e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200"
                  />
                  {plages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => maj({ slots: plages.filter((_, j) => j !== i) })}
                      className="text-sm text-red-600 hover:underline"
                    >
                      retirer
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => maj({ slots: [...plages, { start: '17:00', end: '21:30' }] })}
              className="mt-2 text-sm text-orange-600 hover:underline"
            >
              + ajouter une plage (midi et soir)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                À partir du <span className="font-normal text-gray-400">(optionnel)</span>
              </label>
              <input
                type="date"
                value={regle?.from ?? ''}
                onChange={e => maj({ from: e.target.value || null })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Jusqu&apos;au <span className="font-normal text-gray-400">(optionnel)</span>
              </label>
              <input
                type="date"
                value={regle?.until ?? ''}
                onChange={e => maj({ until: e.target.value || null })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200"
              />
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-500">Résumé : </span>
            <span className="font-medium">{decrireSchedule(regle)}</span>
            <span className={`ml-2 ${vendableMaintenant ? 'text-green-600' : 'text-gray-400'}`}>
              {vendableMaintenant ? '· vendable en ce moment' : '· pas vendable en ce moment'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
