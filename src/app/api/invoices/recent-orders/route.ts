import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GET /api/invoices/recent-orders?establishmentId=X[&days=7] ──────────────
//
// Retourne les commandes récentes d'un établissement, utilisé par le modal
// "Générer facture" du counter pour la sélection multi-commandes.
// Utilise service_role (bypass RLS) — le counter device est authentifié
// par cookie, pas par session Supabase auth.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const establishmentId = searchParams.get('establishmentId')
  const daysParam = searchParams.get('days')
  const days = daysParam ? Math.min(31, Math.max(1, parseInt(daysParam, 10))) : 7

  if (!establishmentId) {
    return NextResponse.json({ error: 'establishmentId required' }, { status: 400 })
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('orders')
    .select('id, order_number, order_type, total, status, created_at')
    .eq('establishment_id', establishmentId)
    .gte('created_at', since)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[invoices/recent-orders] error:', error)
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }

  return NextResponse.json({ orders: data || [] })
}
