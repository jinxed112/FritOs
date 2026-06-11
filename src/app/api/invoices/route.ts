import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { calculateInvoiceTotals } from '@/lib/invoice/calculate'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Input validation ───────────────────────────────────────────────────────

const CustomerSchema = z.object({
  name: z.string().min(1).max(200),
  vat: z.string().max(40).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
})

const CreateInvoiceBodySchema = z.object({
  establishmentId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()).min(1).max(50),
  customer: CustomerSchema,
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'pending']).default('pending'),
  paidAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

// ─── POST /api/invoices ─────────────────────────────────────────────────────
//
// Creates a B2B invoice from a list of orders for a given establishment.
//   - Validates that all orders belong to the establishment
//   - Computes HT / VAT 6% / VAT 12% / TTC from order_type (eat_in vs other)
//   - Generates a sequential invoice number via RPC next_invoice_number(estab)
//   - Inserts invoice + invoice_orders rows
//
// Auth: this endpoint trusts the cookie-based device session that the counter
// app already uses. Service role is required because the counter UI hits this
// from a device session (no Supabase auth.uid()), so RLS doesn't apply.
// The integrity check is the explicit verification that all orderIds belong
// to the declared establishmentId (cross-tenant cannot be forged).

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateInvoiceBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { establishmentId, orderIds, customer, paymentMethod, paidAt, notes } = parsed.data

    // 1. Fetch orders + verify they all belong to the declared establishment
    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select('id, order_number, order_type, total, establishment_id, created_at')
      .in('id', orderIds)

    if (ordersErr) {
      console.error('[invoices] orders fetch error:', ordersErr)
      return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
    }
    if (!orders || orders.length !== orderIds.length) {
      return NextResponse.json(
        { error: 'Some orders not found', expected: orderIds.length, got: orders?.length || 0 },
        { status: 404 }
      )
    }
    const mismatched = orders.filter(o => o.establishment_id !== establishmentId)
    if (mismatched.length > 0) {
      return NextResponse.json(
        { error: 'Cross-establishment orders rejected', count: mismatched.length },
        { status: 403 }
      )
    }

    // 2. Compute totals
    const totals = calculateInvoiceTotals(orders)

    // 3. Get next invoice number via DB sequence function
    const { data: numData, error: numErr } = await admin.rpc('next_invoice_number', {
      estab_id: establishmentId,
    })
    if (numErr || !numData) {
      console.error('[invoices] next_invoice_number error:', numErr)
      return NextResponse.json({ error: 'Failed to generate invoice number' }, { status: 500 })
    }
    const invoiceNumber = numData as string

    // 4. Insert invoice
    const { data: invoice, error: insErr } = await admin
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        establishment_id: establishmentId,
        customer_name: customer.name,
        customer_vat: customer.vat || null,
        customer_address: customer.address || null,
        customer_email: customer.email || null,
        total_ht: totals.total_ht,
        vat_6: totals.vat_6,
        vat_12: totals.vat_12,
        total_ttc: totals.total_ttc,
        payment_method: paymentMethod,
        paid_at: paidAt || (paymentMethod === 'pending' ? null : new Date().toISOString()),
        notes: notes || null,
      })
      .select('id, invoice_number')
      .single()

    if (insErr || !invoice) {
      console.error('[invoices] insert error:', insErr)
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
    }

    // 5. Link orders
    const { error: linkErr } = await admin.from('invoice_orders').insert(
      orderIds.map(oid => ({ invoice_id: invoice.id, order_id: oid }))
    )
    if (linkErr) {
      console.error('[invoices] invoice_orders insert error:', linkErr)
      // Best effort: rollback the invoice row
      await admin.from('invoices').delete().eq('id', invoice.id)
      return NextResponse.json({ error: 'Failed to link orders' }, { status: 500 })
    }

    return NextResponse.json({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
    })
  } catch (err: any) {
    console.error('[invoices] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
