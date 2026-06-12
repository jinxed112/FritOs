import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── PATCH /api/invoices/[id] ───────────────────────────────────────────────
//
// Met à jour le statut de paiement d'une facture.
// Body : { paymentMethod, paidAt?, notes? }

const PatchSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'pending']),
  paidAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const { paymentMethod, paidAt, notes } = parsed.data

    const update: any = { payment_method: paymentMethod }
    if (paymentMethod === 'pending') {
      update.paid_at = null
    } else {
      update.paid_at = paidAt || new Date().toISOString()
    }
    if (notes !== undefined) update.notes = notes

    const { data, error } = await admin
      .from('invoices')
      .update(update)
      .eq('id', params.id)
      .select('id, invoice_number, payment_method, paid_at')
      .single()

    if (error || !data) {
      console.error('[invoices PATCH] err:', error)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[invoices PATCH] unexpected:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ─── GET /api/invoices/[id] ─────────────────────────────────────────────────
//
// Returns a full invoice with its linked orders and order items.
// Used by the invoice display page (/invoice/[id]).

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const invoiceId = params.id

  // Invoice + establishment
  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select(`
      id, invoice_number, customer_name, customer_vat, customer_address, customer_email,
      total_ht, vat_6, vat_12, total_ttc, payment_method, paid_at, notes, created_at,
      establishment_id,
      establishment:establishments(name, address, phone, vat_number)
    `)
    .eq('id', invoiceId)
    .single()

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Linked orders
  const { data: links } = await admin
    .from('invoice_orders')
    .select('order_id')
    .eq('invoice_id', invoiceId)

  const orderIds = (links || []).map(l => l.order_id)

  let orders: any[] = []
  if (orderIds.length > 0) {
    const { data: ordersData } = await admin
      .from('orders')
      .select(`
        id, order_number, order_type, total, created_at,
        order_items(id, product_name, quantity, unit_price, options_selected)
      `)
      .in('id', orderIds)
      .order('created_at', { ascending: true })

    orders = ordersData || []
  }

  return NextResponse.json({ ...invoice, orders })
}
