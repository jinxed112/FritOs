import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Types
type ZReportData = {
  id: string
  establishment_id: string
  report_number: number
  period_start: string
  period_end: string
  orders_count: number
  total_ht: number
  total_tva: number
  total_ttc: number
  eat_in_count: number
  eat_in_total: number
  takeaway_count: number
  takeaway_total: number
  cash_count: number
  cash_total: number
  card_count: number
  card_total: number
  vat_breakdown: VatBreakdown[]
  source_breakdown: SourceBreakdown[]
  top_products: TopProduct[]
  closed_by: string | null
  closed_at: string
  created_at: string
}

type VatBreakdown = {
  rate: number
  base_ht: number
  tva_amount: number
  total_ttc: number
}

type SourceBreakdown = {
  source: string
  count: number
  total: number
}

type TopProduct = {
  product_name: string
  quantity: number
  total: number
}

// GET - Récupérer les rapports Z existants
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const establishmentId = searchParams.get('establishmentId') || 'a0000000-0000-0000-0000-000000000001'
    const limit = parseInt(searchParams.get('limit') || '30')
    
    const { data, error } = await supabase
      .from('z_reports')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('report_number', { ascending: false })
      .limit(limit)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ reports: data })
    
  } catch (error: any) {
    console.error('Z-Report GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Créer un nouveau rapport Z (clôture)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      establishmentId = 'a0000000-0000-0000-0000-000000000001',
      periodStart,
      periodEnd,
      closedBy 
    } = body
    
    // Vérifier qu'il n'y a pas déjà une clôture pour cette période
    const { data: existing } = await supabase
      .from('z_reports')
      .select('id, report_number')
      .eq('establishment_id', establishmentId)
      .gte('period_start', periodStart)
      .lte('period_end', periodEnd)
      .single()
    
    if (existing) {
      return NextResponse.json(
        { error: 'Une clôture existe déjà pour cette période', report: existing },
        { status: 400 }
      )
    }
    
    // Récupérer le dernier numéro de rapport Z
    const { data: lastReport } = await supabase
      .from('z_reports')
      .select('report_number')
      .eq('establishment_id', establishmentId)
      .order('report_number', { ascending: false })
      .limit(1)
      .single()
    
    const nextReportNumber = (lastReport?.report_number || 0) + 1
    
    // Récupérer toutes les commandes de la période
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        order_type,
        subtotal,
        tax_amount,
        total_amount,
        payment_method,
        source,
        order_items (
          product_name,
          quantity,
          unit_price,
          line_total,
          vat_rate,
          options_total
        )
      `)
      .eq('establishment_id', establishmentId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .eq('payment_status', 'paid')
      .neq('status', 'cancelled')
    
    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }
    
    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'Aucune commande à clôturer pour cette période' },
        { status: 400 }
      )
    }
    
    // Calculer les totaux
    const totalTTC = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const totalTVA = orders.reduce((sum, o) => sum + (o.tax_amount || 0), 0)
    const totalHT = totalTTC - totalTVA
    
    const eatInOrders = orders.filter(o => o.order_type === 'eat_in')
    const takeawayOrders = orders.filter(o => o.order_type !== 'eat_in')
    const cashOrders = orders.filter(o => o.payment_method === 'cash')
    const cardOrders = orders.filter(o => o.payment_method === 'card')
    
    // Ventilation TVA
    const vatMap: Record<number, { base: number; tva: number }> = {}
    orders.forEach(order => {
      (order.order_items || []).forEach((item: any) => {
        const rate = item.vat_rate || (order.order_type === 'eat_in' ? 12 : 6)
        const lineTotal = item.line_total || (item.unit_price + (item.options_total || 0)) * item.quantity
        const tvaAmount = lineTotal * rate / (100 + rate)
        const htAmount = lineTotal - tvaAmount
        
        if (!vatMap[rate]) vatMap[rate] = { base: 0, tva: 0 }
        vatMap[rate].base += htAmount
        vatMap[rate].tva += tvaAmount
      })
    })
    
    const vatBreakdown: VatBreakdown[] = Object.entries(vatMap).map(([rate, values]) => ({
      rate: parseFloat(rate),
      base_ht: Math.round(values.base * 100) / 100,
      tva_amount: Math.round(values.tva * 100) / 100,
      total_ttc: Math.round((values.base + values.tva) * 100) / 100,
    }))
    
    // Ventilation par source
    const sourceMap: Record<string, { count: number; total: number }> = {}
    orders.forEach(order => {
      const source = order.source || 'unknown'
      if (!sourceMap[source]) sourceMap[source] = { count: 0, total: 0 }
      sourceMap[source].count += 1
      sourceMap[source].total += order.total_amount || 0
    })
    
    const sourceBreakdown: SourceBreakdown[] = Object.entries(sourceMap).map(([source, data]) => ({
      source,
      count: data.count,
      total: Math.round(data.total * 100) / 100,
    }))
    
    // Top produits
    const productMap: Record<string, { qty: number; total: number }> = {}
    orders.forEach(order => {
      (order.order_items || []).forEach((item: any) => {
        const name = item.product_name
        if (!productMap[name]) productMap[name] = { qty: 0, total: 0 }
        productMap[name].qty += item.quantity
        productMap[name].total += item.line_total || 0
      })
    })
    
    const topProducts: TopProduct[] = Object.entries(productMap)
      .map(([name, data]) => ({
        product_name: name,
        quantity: data.qty,
        total: Math.round(data.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
    
    // Créer le rapport Z
    const reportData = {
      establishment_id: establishmentId,
      report_number: nextReportNumber,
      period_start: periodStart,
      period_end: periodEnd,
      orders_count: orders.length,
      total_ht: Math.round(totalHT * 100) / 100,
      total_tva: Math.round(totalTVA * 100) / 100,
      total_ttc: Math.round(totalTTC * 100) / 100,
      eat_in_count: eatInOrders.length,
      eat_in_total: Math.round(eatInOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0) * 100) / 100,
      takeaway_count: takeawayOrders.length,
      takeaway_total: Math.round(takeawayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0) * 100) / 100,
      cash_count: cashOrders.length,
      cash_total: Math.round(cashOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0) * 100) / 100,
      card_count: cardOrders.length,
      card_total: Math.round(cardOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0) * 100) / 100,
      vat_breakdown: vatBreakdown,
      source_breakdown: sourceBreakdown,
      top_products: topProducts,
      closed_by: closedBy || null,
      closed_at: new Date().toISOString(),
    }
    
    const { data: newReport, error: insertError } = await supabase
      .from('z_reports')
      .insert(reportData)
      .select()
      .single()
    
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      report: newReport,
      message: `Rapport Z n°${nextReportNumber} créé avec succès`
    })
    
  } catch (error: any) {
    console.error('Z-Report POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
