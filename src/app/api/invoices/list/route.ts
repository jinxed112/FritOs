import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GET /api/invoices/list?establishmentId=...&status=...
//
// Liste les factures d'un établissement, optionnellement filtrées par statut.
// status : 'pending' | 'paid' | 'overdue' | 'all' (default all)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const establishmentId = searchParams.get('establishmentId')
  const status = (searchParams.get('status') || 'all').toLowerCase()
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500)

  if (!establishmentId) {
    return NextResponse.json({ error: 'establishmentId required' }, { status: 400 })
  }

  let query = admin
    .from('invoices')
    .select(`
      id, invoice_number, customer_name, customer_vat, customer_address, customer_email,
      total_ht, vat_6, vat_12, total_ttc, payment_method, paid_at, notes, created_at,
      establishment_id
    `)
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status === 'pending') {
    query = query.eq('payment_method', 'pending')
  } else if (status === 'paid') {
    query = query.neq('payment_method', 'pending')
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Compute overdue flag : pending > 30 days
  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  let rows = (data || []).map(inv => {
    const isPending = inv.payment_method === 'pending'
    const createdMs = new Date(inv.created_at).getTime()
    const overdue = isPending && (now - createdMs) > THIRTY_DAYS
    return { ...inv, overdue }
  })

  if (status === 'overdue') {
    rows = rows.filter(r => r.overdue)
  }

  const totals = rows.reduce(
    (acc, r) => {
      const ttc = Number(r.total_ttc) || 0
      acc.total += ttc
      if (r.payment_method === 'pending') acc.pending += ttc
      else acc.paid += ttc
      return acc
    },
    { total: 0, pending: 0, paid: 0 }
  )

  return NextResponse.json({ invoices: rows, totals })
}
