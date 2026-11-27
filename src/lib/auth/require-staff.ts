import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server'

// Garde commune des routes /api/* de la caisse (27/11/2026).
//
// Le middleware ne protège que les PAGES /admin, /counter et /caisse-mobile.
// Les routes /api/* utilisent la clé service_role : sans garde, elles sont
// ouvertes à tout internet. Tous les écrans du magasin (caisse, bornes, KDS,
// back-office) ont une session Supabase dans leurs cookies : on l'exige ici.
//
// - getUser() valide le jeton auprès de Supabase (getSession() ne fait que lire
//   le cookie, qui se falsifie).
// - Le rôle vient de profiles. Les comptes « flexi » (employés qui pointent)
//   partagent la même base : ils ne sont PAS du personnel de caisse.

export const STAFF_ROLES = [
  'super_admin',
  'admin',
  'manager',
  'employee',
  'device_kds',
  'device_counter',
  'device_kiosk',
] as const

export const ADMIN_ROLES = ['super_admin', 'admin'] as const

// tsconfig n'est pas en mode strict : une union discriminée ne se réduit pas.
// On expose donc un seul type ; response est non nul quand l'accès est refusé.
export type StaffAuth = {
  response: NextResponse | null
  userId: string | null
  role: string | null
  establishmentId: string | null
}

type CachedProfile = { role: string; establishmentId: string | null; exp: number }

// Mémoire courte par instance : évite une lecture de profiles à chaque appel
// (le suivi d'un paiement interroge /api/viva/payment toutes les secondes).
const profileCache = new Map<string, CachedProfile>()
const PROFILE_TTL_MS = 60_000

const refuse = (status: 401 | 403, error: string): StaffAuth => ({
  response: NextResponse.json({ error }, { status }),
  userId: null,
  role: null,
  establishmentId: null,
})

export async function requireStaff(
  roles: readonly string[] = STAFF_ROLES
): Promise<StaffAuth> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return refuse(401, 'Non authentifié')

    let profile = profileCache.get(user.id)
    if (!profile || profile.exp < Date.now()) {
      const { data } = await createAdminClient()
        .from('profiles')
        .select('role, establishment_id')
        .eq('id', user.id)
        .single()
      if (!data?.role) return refuse(403, 'Accès refusé')
      profile = {
        role: data.role,
        establishmentId: data.establishment_id ?? null,
        exp: Date.now() + PROFILE_TTL_MS,
      }
      profileCache.set(user.id, profile)
    }

    if (!roles.includes(profile.role)) return refuse(403, 'Accès refusé')
    return { response: null, userId: user.id, role: profile.role, establishmentId: profile.establishmentId }
  } catch (e) {
    console.error('requireStaff error:', e)
    return refuse(401, 'Non authentifié')
  }
}
