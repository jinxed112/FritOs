import { NextResponse } from 'next/server'
import {
  createServerSupabaseClient,
  createAdminClient,
} from '@/lib/supabase/server'
import { getCurrentEstablishment } from '@/lib/establishment/server'

const ALLOWED_ROLES = ['super_admin', 'admin', 'manager', 'employee']

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('role, establishment_id')
      .eq('id', user.id)
      .single()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    let allowedQuery = admin
      .from('establishments')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name')
    if (profile.role !== 'super_admin') {
      if (!profile.establishment_id) {
        return NextResponse.json({
          current: null,
          user: {
            id: user.id,
            role: profile.role,
            pinned_establishment_id: null,
          },
          allowed: [],
        })
      }
      allowedQuery = allowedQuery.eq('id', profile.establishment_id)
    }
    const { data: allowed } = await allowedQuery

    const current = await getCurrentEstablishment()

    return NextResponse.json({
      current,
      user: {
        id: user.id,
        role: profile.role,
        pinned_establishment_id: profile.establishment_id ?? null,
      },
      allowed: allowed ?? [],
    })
  } catch (e: any) {
    console.error('current-establishment GET error:', e)
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
