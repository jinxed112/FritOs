import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateUBLInvoice } from '@/lib/invoice/ubl'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── POST /api/invoices/[id]/send-to-accountant ─────────────────────────────
//
// Génère l'UBL 2.1 PEPPOL BIS Billing 3.0 de la facture et l'envoie en
// pièce jointe email à l'adresse comptable configurée pour l'établissement.
//
// Voie 2 (PEPPOL via WinAuditor PeppolGO) : WinAuditor reçoit le UBL via la
// boîte de réception dédiée du journal FACT (configurable côté WinAuditor),
// l'importe automatiquement, et — si PeppolGO est activé — peut le relayer
// sur le réseau PEPPOL vers le destinataire.
//
// Auth : session admin Supabase requise côté UI.
//
// Config (env Vercel) :
//   - BREVO_API_KEY                  (existant pour OTP)
//   - BREVO_SENDER_EMAIL             (existant)
//   - BREVO_SENDER_NAME              (existant)
//   - ACCOUNTANT_EMAIL_BOUSSU        adresse WinAuditor pour SBURGS Boussu
//   - ACCOUNTANT_EMAIL_JURBISE       adresse WinAuditor pour SBURGS Jurbise
//   - ACCOUNTANT_EMAIL_EVENEMENTS    adresse WinAuditor pour SBURGS Événements
//   - ACCOUNTANT_EMAIL_FALLBACK      adresse de repli si pas de mapping

const ACCOUNTANT_EMAIL_BY_SLUG: Record<string, string | undefined> = {
  boussu: process.env.ACCOUNTANT_EMAIL_BOUSSU,
  'mdjambo-jurbise': process.env.ACCOUNTANT_EMAIL_JURBISE,
  evenements: process.env.ACCOUNTANT_EMAIL_EVENEMENTS,
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Charger la facture + l'établissement
    const { data: invoice, error: invErr } = await admin
      .from('invoices')
      .select(`
        id, invoice_number, customer_name, customer_vat, customer_address, customer_email,
        total_ht, vat_6, vat_12, total_ttc, payment_method, paid_at, notes, created_at,
        establishment_id,
        establishment:establishments(name, slug, address, phone, vat_number)
      `)
      .eq('id', params.id)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    const est = (invoice as any).establishment
    if (!est) {
      return NextResponse.json({ error: 'Établissement introuvable' }, { status: 500 })
    }

    // 2. Résoudre l'adresse email du comptable WinAuditor
    const accountantEmail =
      ACCOUNTANT_EMAIL_BY_SLUG[est.slug] || process.env.ACCOUNTANT_EMAIL_FALLBACK
    if (!accountantEmail) {
      return NextResponse.json(
        {
          error: `Pas d'adresse email comptable configurée pour ${est.slug}. Ajoute ACCOUNTANT_EMAIL_${est.slug.toUpperCase().replace(/-/g, '_')} dans les env vars Vercel.`,
        },
        { status: 503 }
      )
    }

    // 3. Charger les commandes liées + leurs items
    const { data: links } = await admin
      .from('invoice_orders')
      .select('order_id')
      .eq('invoice_id', invoice.id)
    const orderIds = (links || []).map(l => l.order_id)
    if (orderIds.length === 0) {
      return NextResponse.json({ error: 'Aucune commande liée' }, { status: 400 })
    }

    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select(`
        id, order_number, order_type, total, created_at,
        order_items (
          product_name, quantity, unit_price, options_total,
          options_selected, line_total, vat_rate
        )
      `)
      .in('id', orderIds)
      .order('created_at', { ascending: true })

    if (ordersErr || !orders) {
      return NextResponse.json({ error: 'Erreur chargement commandes' }, { status: 500 })
    }

    // 4. Générer le UBL
    const ublXml = generateUBLInvoice({
      invoice: {
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        customer_vat: invoice.customer_vat,
        customer_address: invoice.customer_address,
        customer_email: invoice.customer_email,
        total_ht: Number(invoice.total_ht),
        vat_6: Number(invoice.vat_6),
        vat_12: Number(invoice.vat_12),
        total_ttc: Number(invoice.total_ttc),
        notes: invoice.notes,
        created_at: invoice.created_at,
        payment_method: invoice.payment_method,
      },
      establishment: {
        name: est.name,
        address: est.address,
        phone: est.phone,
        vat_number: est.vat_number,
        legal_name: 'SBURGS SRL',
      },
      orders: orders as any,
      dueDateDaysFromIssue: 30,
    })

    // 5. Envoyer via Brevo
    const ublB64 = Buffer.from(ublXml, 'utf-8').toString('base64')
    const fileName = `facture-${invoice.invoice_number.replace(/\//g, '-')}.xml`

    const brevoBody = {
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'MDjambo',
        email: process.env.BREVO_SENDER_EMAIL || 'commandes@mdjambo.be',
      },
      to: [{ email: accountantEmail }],
      subject: `Facture ${invoice.invoice_number} — ${invoice.customer_name} — ${Number(invoice.total_ttc).toFixed(2)} €`,
      htmlContent: `
        <p>Bonjour,</p>
        <p>Veuillez trouver ci-joint le fichier UBL de la facture
        <strong>${invoice.invoice_number}</strong>
        à destination de <em>${invoice.customer_name}</em>
        d'un montant total de <strong>${Number(invoice.total_ttc).toFixed(2)} €</strong> TTC
        (date facture : ${new Date(invoice.created_at).toLocaleDateString('fr-BE')}).</p>
        <p>Statut paiement : <strong>${invoice.payment_method === 'pending' ? 'À recevoir' : 'Acquittée'}</strong>.</p>
        <p>Établissement émetteur : ${est.name}.</p>
        <hr>
        <p style="color:#888;font-size:11px">
          Envoi automatique depuis FritOS — format UBL 2.1 PEPPOL BIS Billing 3.0.
        </p>
      `,
      attachment: [
        {
          name: fileName,
          content: ublB64,
        },
      ],
    }

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
      },
      body: JSON.stringify(brevoBody),
    })

    if (!brevoRes.ok) {
      const txt = await brevoRes.text()
      console.error('[send-to-accountant] Brevo error:', txt)
      return NextResponse.json(
        { error: 'Envoi email comptable échoué', details: txt },
        { status: 502 }
      )
    }

    // 6. Marquer comme envoyé (champ optionnel — fallback si pas en DB)
    try {
      await admin
        .from('invoices')
        .update({ sent_to_accountant_at: new Date().toISOString() })
        .eq('id', invoice.id)
    } catch {
      // Colonne absente : on continue, l'envoi a réussi. Migration suggérée :
      //   ALTER TABLE invoices ADD COLUMN sent_to_accountant_at timestamptz;
    }

    return NextResponse.json({
      success: true,
      sentTo: accountantEmail,
      fileName,
    })
  } catch (err: any) {
    console.error('[send-to-accountant] unexpected:', err)
    return NextResponse.json({ error: 'Erreur serveur', details: err?.message }, { status: 500 })
  }
}

// GET — récupère l'UBL généré sans l'envoyer (debug / téléchargement manuel)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: invoice, error: invErr } = await admin
      .from('invoices')
      .select(`
        id, invoice_number, customer_name, customer_vat, customer_address, customer_email,
        total_ht, vat_6, vat_12, total_ttc, payment_method, paid_at, notes, created_at,
        establishment_id,
        establishment:establishments(name, slug, address, phone, vat_number)
      `)
      .eq('id', params.id)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }
    const est = (invoice as any).establishment

    const { data: links } = await admin
      .from('invoice_orders')
      .select('order_id')
      .eq('invoice_id', invoice.id)
    const orderIds = (links || []).map(l => l.order_id)

    const { data: orders } = await admin
      .from('orders')
      .select(`
        id, order_number, order_type, total, created_at,
        order_items (
          product_name, quantity, unit_price, options_total,
          options_selected, line_total, vat_rate
        )
      `)
      .in('id', orderIds)
      .order('created_at', { ascending: true })

    const ublXml = generateUBLInvoice({
      invoice: {
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        customer_vat: invoice.customer_vat,
        customer_address: invoice.customer_address,
        customer_email: invoice.customer_email,
        total_ht: Number(invoice.total_ht),
        vat_6: Number(invoice.vat_6),
        vat_12: Number(invoice.vat_12),
        total_ttc: Number(invoice.total_ttc),
        notes: invoice.notes,
        created_at: invoice.created_at,
        payment_method: invoice.payment_method,
      },
      establishment: {
        name: est.name,
        address: est.address,
        phone: est.phone,
        vat_number: est.vat_number,
        legal_name: 'SBURGS SRL',
      },
      orders: (orders ?? []) as any,
      dueDateDaysFromIssue: 30,
    })

    return new NextResponse(ublXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="facture-${invoice.invoice_number.replace(/\//g, '-')}.xml"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Erreur serveur', details: err?.message }, { status: 500 })
  }
}
