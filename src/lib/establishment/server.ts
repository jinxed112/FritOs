import { cookies } from 'next/headers'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server'
import {
  ESTABLISHMENT_COOKIE_NAME,
  verifyEstablishmentCookie,
} from './cookie'

export type CurrentEstablishment = {
  id: string
  name: string
  slug: string
}

export class EstablishmentRequiredError extends Error {
  constructor(message = 'Establishment selection required') {
    super(message)
    this.name = 'EstablishmentRequiredError'
  }
}

export async function getCurrentEstablishment(): Promise<CurrentEstablishment | null> {
  const cookieStore = cookies()
  const raw = cookieStore.get(ESTABLISHMENT_COOKIE_NAME)?.value
  if (!raw) return null

  const payload = verifyEstablishmentCookie(raw)
  if (!payload) return null

  // Bind to the current Supabase user — if the cookie was issued for a different
  // user (or there is no session at all), refuse it.
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== payload.user_id) return null

  // Make sure the establishment still exists and is active.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('establishments')
    .select('id, name, slug, is_active')
    .eq('id', payload.est_id)
    .single()
  if (error || !data || !data.is_active) return null

  return { id: data.id, name: data.name, slug: data.slug }
}

export async function requireEstablishment(): Promise<CurrentEstablishment> {
  const e = await getCurrentEstablishment()
  if (!e) throw new EstablishmentRequiredError()
  return e
}
