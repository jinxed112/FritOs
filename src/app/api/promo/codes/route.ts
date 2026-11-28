import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/require-staff'

export const dynamic = 'force-dynamic'

const ROLES_BACK_OFFICE = ['super_admin', 'admin', 'manager'] as const

// GET : liste des codes promo d'un site, pour le back-office.
// La table n'est lisible que côté serveur : le back-office passe donc par ici
// pour afficher les codes qu'il crée.
export async function GET(request: NextRequest) {
  const auth = await requireStaff(ROLES_BACK_OFFICE)
  if (auth.response) return auth.response

  try {
    const establishmentId = new URL(request.url).searchParams.get('establishmentId')
    if (!establishmentId || !/^[0-9a-f-]{36}$/i.test(establishmentId)) {
      return NextResponse.json({ error: 'establishmentId requis' }, { status: 400 })
    }
    // Un compte rattaché à un site ne lit que les codes de ce site
    if (auth.role !== 'super_admin' && auth.establishmentId && auth.establishmentId !== establishmentId) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { data, error } = await createAdminClient()
      .from('promo_codes')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ codes: data || [] })
  } catch (e) {
    console.error('Erreur lecture codes promo:', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
