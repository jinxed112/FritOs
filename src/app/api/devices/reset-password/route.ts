import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// SÉCURITÉ (27/11/2026) : cette route change le mot de passe de N'IMPORTE QUEL
// compte de la base partagée (caisse, OrderMdj, Flexi) avec la clé service_role.
// Elle était ouverte à tous, sans connexion. Désormais : session Supabase
// valide ET rôle super_admin ou admin dans profiles, sinon 401 / 403.
const ROLES_AUTORISES = ['super_admin', 'admin']

// Client admin avec service_role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || !ROLES_AUTORISES.includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { auth_user_id, new_password } = await request.json()

    if (!auth_user_id || !new_password) {
      return NextResponse.json(
        { error: 'auth_user_id et new_password requis' },
        { status: 400 }
      )
    }

    if (new_password.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe doit faire au moins 8 caractères' },
        { status: 400 }
      )
    }

    // Mettre à jour le mot de passe via l'API admin
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      auth_user_id,
      { password: new_password }
    )

    if (error) {
      console.error('Reset password error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
