import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  createServerSupabaseClient,
  createAdminClient,
} from '@/lib/supabase/server'
import {
  ESTABLISHMENT_COOKIE_NAME,
  ESTABLISHMENT_COOKIE_MAX_AGE_SECONDS,
  signEstablishmentPayload,
} from '@/lib/establishment/cookie'

const ALLOWED_ROLES = ['super_admin', 'admin', 'manager', 'employee']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const establishmentId = body?.establishmentId
    if (!establishmentId || typeof establishmentId !== 'string') {
      return NextResponse.json(
        { error: 'establishmentId requis' },
        { status: 400 }
      )
    }

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

    if (profile.role !== 'super_admin') {
      if (
        !profile.establishment_id ||
        profile.establishment_id !== establishmentId
      ) {
        return NextResponse.json(
          { error: 'Établissement non autorisé pour ce compte' },
          { status: 403 }
        )
      }
    }

    const { data: est, error } = await admin
      .from('establishments')
      .select('id, name, slug, is_active')
      .eq('id', establishmentId)
      .single()
    if (error || !est || !est.is_active) {
      return NextResponse.json(
        { error: 'Établissement introuvable ou inactif' },
        { status: 404 }
      )
    }

    const now = Math.floor(Date.now() / 1000)
    const cookieValue = signEstablishmentPayload({
      est_id: est.id,
      user_id: user.id,
      iat: now,
      exp: now + ESTABLISHMENT_COOKIE_MAX_AGE_SECONDS,
    })

    cookies().set(ESTABLISHMENT_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ESTABLISHMENT_COOKIE_MAX_AGE_SECONDS,
      path: '/',
    })

    return NextResponse.json({
      success: true,
      establishment: { id: est.id, name: est.name, slug: est.slug },
    })
  } catch (e: any) {
    console.error('select-establishment POST error:', e)
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    cookies().delete(ESTABLISHMENT_COOKIE_NAME)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
