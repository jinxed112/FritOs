'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

type Order = {
  id: string
  order_number: string
  created_at: string
  order_type: string
  status: string
  payment_method: string
  payment_status: string
  subtotal: number
  total: number
  customer_name?: string
  customer_phone?: string
  source: string
  order_items: OrderItem[]
}

type OrderItem = {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
  vat_rate: number
  options_selected: any
  options_total: number
}

type DailyStats = {
  date: string
  orders_count: number
  total_ht: number
  total_tva: number
  total_ttc: number
  eat_in_count: number
  eat_in_total: number
  takeaway_count: number
  takeaway_total: number
  delivery_count: number
  delivery_total: number
  cash_count: number
  cash_total: number
  card_count: number
  card_total: number
}

type ZReport = {
  id: string
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
  vat_breakdown: any[]
  top_products: any[]
  closed_at: string
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tickets' | 'z-reports'>('dashboard')
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  const [stats, setStats] = useState<DailyStats[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [zReports, setZReports] = useState<ZReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedZReport, setSelectedZReport] = useState<ZReport | null>(null)
  const [totals, setTotals] = useState({
    orders: 0, ht: 0, tva: 0, ttc: 0,
    eat_in: 0, takeaway: 0, delivery: 0,
    cash: 0, card: 0
  })

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
  }, [dateRange])

  async function loadData() {
    setLoading(true)
    
    // Charger les commandes
    const { data: ordersData } = await supabase
      .from('orders')
      .select(`*, order_items (*)`)
      .eq('establishment_id', establishmentId)
      .gte('created_at', dateRange.start + 'T00:00:00')
      .lte('created_at', dateRange.end + 'T23:59:59')
      .in('payment_status', ['paid', 'refunded'])
      .order('created_at', { ascending: false })

    setOrders((ordersData || []) as Order[])

    // Stats par jour (seulement commandes payées non annulées)
    const paidOrders = (ordersData || []).filter((o: any) => 
      o.payment_status === 'paid' && !['cancelled', 'refunded'].includes(o.status)
    )
    
    const dailyMap = new Map<string, DailyStats>()
    paidOrders.forEach((order: any) => {
      const date = order.created_at.split('T')[0]
      const existing = dailyMap.get(date) || {
        date, orders_count: 0, total_ht: 0, total_tva: 0, total_ttc: 0,
        eat_in_count: 0, eat_in_total: 0, takeaway_count: 0, takeaway_total: 0,
        delivery_count: 0, delivery_total: 0, cash_count: 0, cash_total: 0,
        card_count: 0, card_total: 0
      }

      existing.orders_count++
      const ttc = Number(order.total) || 0
      const ht = Number(order.subtotal) || 0
      existing.total_ttc += ttc
      existing.total_ht += ht
      existing.total_tva += ttc - ht

      if (order.order_type === 'eat_in') { existing.eat_in_count++; existing.eat_in_total += ttc }
      else if (order.order_type === 'delivery') { existing.delivery_count++; existing.delivery_total += ttc }
      else { existing.takeaway_count++; existing.takeaway_total += ttc }

      if (order.payment_method === 'cash') { existing.cash_count++; existing.cash_total += ttc }
      else { existing.card_count++; existing.card_total += ttc }

      dailyMap.set(date, existing)
    })

    const dailyStats = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date))
    setStats(dailyStats)

    // Totaux
    const t = dailyStats.reduce((acc, day) => ({
      orders: acc.orders + day.orders_count,
      ht: acc.ht + day.total_ht,
      tva: acc.tva + day.total_tva,
      ttc: acc.ttc + day.total_ttc,
      eat_in: acc.eat_in + day.eat_in_total,
      takeaway: acc.takeaway + day.takeaway_total,
      delivery: acc.delivery + day.delivery_total,
      cash: acc.cash + day.cash_total,
      card: acc.card + day.card_total
    }), { orders: 0, ht: 0, tva: 0, ttc: 0, eat_in: 0, takeaway: 0, delivery: 0, cash: 0, card: 0 })
    setTotals(t)

    // Rapports Z
    const { data: zData } = await supabase
      .from('z_reports')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('closed_at', { ascending: false })
      .limit(100)
    setZReports(zData || [])

    setLoading(false)
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
  }

  function getOrderTypeLabel(type: string) {
    const labels: Record<string, string> = { eat_in: '🍽️ Sur place', takeaway: '🥡 Emporter', delivery: '🚗 Livraison' }
    return labels[type] || type
  }

  function getStatusBadge(status: string, paymentStatus: string) {
    if (paymentStatus === 'refunded') return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">Remboursé</span>
    const badges: Record<string, JSX.Element> = {
      pending: <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">En attente</span>,
      preparing: <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">En prépa</span>,
      ready: <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Prêt</span>,
      completed: <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">Terminé</span>,
      cancelled: <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">Annulé</span>,
    }
    return badges[status] || <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">{status}</span>
  }

  // Export Excel format RestoMax - 5 fichiers
  async function exportExcel() {
    const paidOrders = orders.filter(o => o.payment_status === 'paid' && o.status !== 'cancelled')
    
    if (paidOrders.length === 0) {
      alert('Aucune donnée à exporter')
      return
    }

    // Calculer les données par jour avec ventilation TVA complète
    const dailyData = new Map<string, any>()
    const itemsSales = new Map<string, { qty: number, total: number, category: string }>()
    const categoryTotals = new Map<string, number>()

    paidOrders.forEach(order => {
      const dateKey = order.created_at.split('T')[0].replace(/-/g, '/')
      const existing = dailyData.get(dateKey) || {
        date: dateKey,
        caTTC: 0,
        caPlace: 0,
        caEmporter: 0,
        caDelivery: 0,
        ttc21: 0, ttc12: 0, ttc6: 0, ttc0: 0,
        htva21: 0, htva12: 0, htva6: 0, htva0: 0,
        tva21: 0, tva12: 0, tva6: 0,
        cash: 0, card: 0,
        tickets: 0
      }

      const orderTotal = Number(order.total) || 0
      existing.caTTC += orderTotal
      existing.tickets++

      // Par type
      if (order.order_type === 'eat_in') existing.caPlace += orderTotal
      else if (order.order_type === 'delivery') existing.caDelivery += orderTotal
      else existing.caEmporter += orderTotal

      // Par paiement
      if (order.payment_method === 'cash') existing.cash += orderTotal
      else existing.card += orderTotal

      // Ventilation TVA par article
      ;(order.order_items || []).forEach((item: OrderItem) => {
        const vatRate = item.vat_rate || (order.order_type === 'eat_in' ? 12 : 6)
        const lineTTC = item.line_total || 0
        const lineHT = lineTTC / (1 + vatRate / 100)
        const lineTVA = lineTTC - lineHT

        if (vatRate === 21) {
          existing.ttc21 += lineTTC
          existing.htva21 += lineHT
          existing.tva21 += lineTVA
        } else if (vatRate === 12) {
          existing.ttc12 += lineTTC
          existing.htva12 += lineHT
          existing.tva12 += lineTVA
        } else if (vatRate === 6) {
          existing.ttc6 += lineTTC
          existing.htva6 += lineHT
          existing.tva6 += lineTVA
        } else {
          existing.ttc0 += lineTTC
          existing.htva0 += lineHT
        }

        // Pour DetailSales
        const itemKey = `${item.product_name}|${item.unit_price}`
        const itemData = itemsSales.get(itemKey) || { qty: 0, total: 0, category: 'Divers' }
        itemData.qty += item.quantity
        itemData.total += lineTTC
        itemsSales.set(itemKey, itemData)

        // Pour CAByItemLevel (par catégorie)
        const cat = itemData.category
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + lineTTC)
      })

      dailyData.set(dateKey, existing)
    })

    // ============ CA.xlsx - Format RestoMax ============
    const caHeaders = ['Date', 'CA TTC', 'CA TTC /place', 'CA TTC /emporter', 'CA TTC /delivery', 
      'TTC 21%', 'TTC 12%', 'TTC 6%', 'TTC 0%', 'HTVA 21%', 'HTVA 12%', 'HTVA 6%', 'HTVA 0%',
      'TVA 21%', 'TVA 12%', 'TVA 6%', 'Cash', 'Carte banque', 'Virement bancaire', 
      'Bonsai', 'Mollie', 'Chèque repas', 'Chèque cadeau', 'Chèque culture/sport', 
      'Ecochèque', 'Chèque transport', 'Arrondi', 'Libre1', 'Libre2', 'Libre3', 
      'Libre4', 'Libre5', 'Libre6', 'Libre7', 'Tickets']

    const caRows: any[][] = []
    let totals_ca = { caTTC: 0, caPlace: 0, caEmporter: 0, caDelivery: 0, 
      ttc21: 0, ttc12: 0, ttc6: 0, ttc0: 0, htva21: 0, htva12: 0, htva6: 0, htva0: 0,
      tva21: 0, tva12: 0, tva6: 0, cash: 0, card: 0, tickets: 0 }

    Array.from(dailyData.values()).forEach(d => {
      caRows.push([
        d.date, r(d.caTTC), r(d.caPlace), r(d.caEmporter), r(d.caDelivery),
        r(d.ttc21), r(d.ttc12), r(d.ttc6), r(d.ttc0),
        r(d.htva21), r(d.htva12), r(d.htva6), r(d.htva0),
        r(d.tva21), r(d.tva12), r(d.tva6),
        r(d.cash), r(d.card), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, d.tickets
      ])
      // Cumul totaux
      Object.keys(totals_ca).forEach(k => totals_ca[k as keyof typeof totals_ca] += d[k] || 0)
    })

    // Ligne Total
    caRows.push([
      'Total', r(totals_ca.caTTC), r(totals_ca.caPlace), r(totals_ca.caEmporter), r(totals_ca.caDelivery),
      r(totals_ca.ttc21), r(totals_ca.ttc12), r(totals_ca.ttc6), r(totals_ca.ttc0),
      r(totals_ca.htva21), r(totals_ca.htva12), r(totals_ca.htva6), r(totals_ca.htva0),
      r(totals_ca.tva21), r(totals_ca.tva12), r(totals_ca.tva6),
      r(totals_ca.cash), r(totals_ca.card), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, totals_ca.tickets
    ])

    const wbCA = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wbCA, XLSX.utils.aoa_to_sheet([caHeaders, ...caRows]), 'CA')
    XLSX.writeFile(wbCA, `CA_${dateRange.start}_${dateRange.end}.xlsx`)

    // ============ DetailSales.xlsx ============
    const detailHeaders = ['Article', 'Quantité', 'Prix', 'Nombre remises ', 'Total remises', 'Total', 'Famille (hiérarchie)']
    const detailRows: any[][] = []
    
    Array.from(itemsSales.entries()).forEach(([key, data]) => {
      const [name, price] = key.split('|')
      detailRows.push([name, data.qty, Number(price) || 0, 0, 0, r(data.total), data.category])
    })

    const wbDetail = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wbDetail, XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]), 'DetailSales')
    XLSX.writeFile(wbDetail, `DetailSales_${dateRange.start}_${dateRange.end}.xlsx`)

    // ============ ReportZStats.xlsx ============
    const zHeaders = ['Rapport Z', "Date d'ouverture", 'Date de fermeture', 'CA TTC', 
      'TTC 21%', 'TTC 12%', 'TTC 6%', 'TTC 0%', 'HTVA 21%', 'HTVA 12%', 'HTVA 6%', 'HTVA 0%',
      'TVA 21%', 'TVA 12%', 'TVA 6%', 'Tickets']

    const zRows = zReports.map(z => [
      z.report_number,
      formatDateTime(z.period_start),
      formatDateTime(z.closed_at),
      r(z.total_ttc),
      r(getVatValue(z.vat_breakdown, 21, 'total_ttc')),
      r(getVatValue(z.vat_breakdown, 12, 'total_ttc')),
      r(getVatValue(z.vat_breakdown, 6, 'total_ttc')),
      0,
      r(getVatValue(z.vat_breakdown, 21, 'base_ht')),
      r(getVatValue(z.vat_breakdown, 12, 'base_ht')),
      r(getVatValue(z.vat_breakdown, 6, 'base_ht')),
      0,
      r(getVatValue(z.vat_breakdown, 21, 'tva_amount')),
      r(getVatValue(z.vat_breakdown, 12, 'tva_amount')),
      r(getVatValue(z.vat_breakdown, 6, 'tva_amount')),
      z.orders_count
    ])

    const wbZ = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wbZ, XLSX.utils.aoa_to_sheet([zHeaders, ...zRows]), 'ReportZStats')
    XLSX.writeFile(wbZ, `ReportZStats_${dateRange.start}_${dateRange.end}.xlsx`)

    alert('✅ 3 fichiers Excel exportés (format RestoMax)')
  }

  // Helpers pour export
  function r(n: number) { return Math.round((n || 0) * 100) / 100 }
  function formatDateTime(d: string) { 
    const date = new Date(d)
    return `${date.toLocaleDateString('fr-BE')} ${date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`
  }
  function getVatValue(breakdown: any[], rate: number, field: string): number {
    const found = (breakdown || []).find((v: any) => v.rate === rate)
    return found ? found[field] : 0
  }

  // Tabs
  const tabs = [
    { key: 'dashboard', label: '📊 Dashboard', icon: '📊' },
    { key: 'tickets', label: '🧾 Tickets', icon: '🧾' },
    { key: 'z-reports', label: '📋 Rapports Z', icon: '📋' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📊 Rapports & Statistiques</h1>
          <p className="text-gray-500">Analyse des ventes et export comptable</p>
        </div>
        <button
          onClick={exportExcel}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700 font-semibold"
        >
          📥 Export Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filtres date */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Du</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Au</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex gap-2 ml-4">
            <button onClick={() => {
              const today = new Date().toISOString().split('T')[0]
              setDateRange({ start: today, end: today })
            }} className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm">Aujourd'hui</button>
            <button onClick={() => {
              const today = new Date()
              const yesterday = new Date(today.setDate(today.getDate() - 1)).toISOString().split('T')[0]
              setDateRange({ start: yesterday, end: yesterday })
            }} className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm">Hier</button>
            <button onClick={() => {
              const end = new Date().toISOString().split('T')[0]
              const start = new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]
              setDateRange({ start, end })
            }} className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm">7 jours</button>
            <button onClick={() => {
              const end = new Date().toISOString().split('T')[0]
              const start = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
              setDateRange({ start, end })
            }} className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm">30 jours</button>
            <button onClick={() => {
              const now = new Date()
              const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
              const end = new Date().toISOString().split('T')[0]
              setDateRange({ start, end })
            }} className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm">Ce mois</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : (
        <>
          {/* ==================== DASHBOARD ==================== */}
          {activeTab === 'dashboard' && (
            <>
              {/* Cards résumé */}
              <div className="grid grid-cols-4 gap-6 mb-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <p className="text-gray-500 text-sm">Commandes</p>
                  <p className="text-3xl font-bold text-gray-900">{totals.orders}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <p className="text-gray-500 text-sm">Total HT</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(totals.ht)}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <p className="text-gray-500 text-sm">TVA</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(totals.tva)}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <p className="text-gray-500 text-sm">Total TTC</p>
                  <p className="text-3xl font-bold text-orange-500">{formatCurrency(totals.ttc)}</p>
                </div>
              </div>

              {/* Par type et paiement */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Par type de commande</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">🍽️ Sur place</span>
                      <span className="font-semibold">{formatCurrency(totals.eat_in)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">🥡 Emporter</span>
                      <span className="font-semibold">{formatCurrency(totals.takeaway)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">🚗 Livraison</span>
                      <span className="font-semibold">{formatCurrency(totals.delivery)}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Par mode de paiement</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">💵 Espèces</span>
                      <span className="font-semibold">{formatCurrency(totals.cash)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">💳 Carte</span>
                      <span className="font-semibold">{formatCurrency(totals.card)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tableau journalier */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Détail par jour</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Date</th>
                      <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">Cmd</th>
                      <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">HT</th>
                      <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">TVA</th>
                      <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">TTC</th>
                      <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">💵</th>
                      <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">💳</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.map(day => (
                      <tr key={day.date} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium">{formatDate(day.date)}</td>
                        <td className="px-6 py-4 text-right">{day.orders_count}</td>
                        <td className="px-6 py-4 text-right">{formatCurrency(day.total_ht)}</td>
                        <td className="px-6 py-4 text-right">{formatCurrency(day.total_tva)}</td>
                        <td className="px-6 py-4 text-right font-semibold">{formatCurrency(day.total_ttc)}</td>
                        <td className="px-6 py-4 text-right text-green-600">{formatCurrency(day.cash_total)}</td>
                        <td className="px-6 py-4 text-right text-blue-600">{formatCurrency(day.card_total)}</td>
                      </tr>
                    ))}
                    {stats.length === 0 && (
                      <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">Aucune donnée</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ==================== TICKETS ==================== */}
          {activeTab === 'tickets' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Liste des tickets ({orders.filter(o => o.payment_status === 'paid').length})</h3>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Date/Heure</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">N° Ticket</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Type</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Statut</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Paiement</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">Total</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium">{formatDate(order.created_at)}</div>
                        <div className="text-sm text-gray-500">{formatTime(order.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold">{order.order_number}</td>
                      <td className="px-6 py-4">{getOrderTypeLabel(order.order_type)}</td>
                      <td className="px-6 py-4">{getStatusBadge(order.status, order.payment_status)}</td>
                      <td className="px-6 py-4">
                        <span className={order.payment_method === 'cash' ? 'text-green-600' : 'text-blue-600'}>
                          {order.payment_method === 'cash' ? '💵 Espèces' : '💳 Carte'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold">{formatCurrency(Number(order.total) || 0)}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="text-orange-600 hover:text-orange-700 font-medium"
                        >
                          Détails
                        </button>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">Aucune commande</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ==================== RAPPORTS Z ==================== */}
          {activeTab === 'z-reports' && (
            <div className="space-y-4">
              {zReports.map(report => (
                <div key={report.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <span className="bg-orange-100 text-orange-600 px-4 py-2 rounded-xl font-mono font-bold">
                        Z-{String(report.report_number).padStart(6, '0')}
                      </span>
                      <div>
                        <p className="font-semibold">{formatDate(report.period_start)}</p>
                        <p className="text-sm text-gray-500">Clôturé le {new Date(report.closed_at).toLocaleString('fr-BE')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-orange-500">{formatCurrency(report.total_ttc)}</p>
                      <p className="text-sm text-gray-500">{report.orders_count} commande(s)</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                    <div className="text-center">
                      <p className="text-sm text-gray-500">🍽️ Sur place</p>
                      <p className="font-bold">{formatCurrency(report.eat_in_total)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500">🥡 Emporter</p>
                      <p className="font-bold">{formatCurrency(report.takeaway_total)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500">💵 Espèces</p>
                      <p className="font-bold">{formatCurrency(report.cash_total)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-500">💳 Carte</p>
                      <p className="font-bold">{formatCurrency(report.card_total)}</p>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => setSelectedZReport(report)}
                      className="flex-1 bg-gray-100 text-gray-700 font-medium py-2 rounded-lg hover:bg-gray-200"
                    >
                      👁️ Voir détails
                    </button>
                  </div>
                </div>
              ))}
              {zReports.length === 0 && (
                <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Aucun rapport Z</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal détail commande */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Ticket #{selectedOrder.order_number}</h2>
                <p className="text-gray-500">{formatDate(selectedOrder.created_at)} à {formatTime(selectedOrder.created_at)}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">✕</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                {getStatusBadge(selectedOrder.status, selectedOrder.payment_status)}
                <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">{getOrderTypeLabel(selectedOrder.order_type)}</span>
                <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">{selectedOrder.payment_method === 'cash' ? '💵 Espèces' : '💳 Carte'}</span>
              </div>

              {selectedOrder.customer_name && (
                <div className="bg-gray-50 p-4 rounded-xl">
                  <p className="font-medium">{selectedOrder.customer_name}</p>
                  {selectedOrder.customer_phone && <p className="text-sm text-gray-500">{selectedOrder.customer_phone}</p>}
                </div>
              )}

              <div className="space-y-2">
                <h3 className="font-semibold">Articles</h3>
                {selectedOrder.order_items?.map((item, i) => (
                  <div key={i} className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium">{item.quantity}x {item.product_name}</p>
                      {item.options_selected && (() => {
                        try {
                          const opts = typeof item.options_selected === 'string' ? JSON.parse(item.options_selected) : item.options_selected
                          return opts.map((o: any, j: number) => (
                            <p key={j} className="text-sm text-gray-500">+ {o.item_name}</p>
                          ))
                        } catch { return null }
                      })()}
                    </div>
                    <p className="font-semibold">{formatCurrency(item.line_total)}</p>
                  </div>
                ))}
              </div>

              <div className="bg-orange-50 p-4 rounded-xl">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Sous-total HT</span>
                  <span>{formatCurrency(Number(selectedOrder.subtotal) || 0)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">TVA</span>
                  <span>{formatCurrency((Number(selectedOrder.total) || 0) - (Number(selectedOrder.subtotal) || 0))}</span>
                </div>
                <div className="flex justify-between text-xl font-bold">
                  <span>Total TTC</span>
                  <span className="text-orange-500">{formatCurrency(Number(selectedOrder.total) || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail rapport Z */}
      {selectedZReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Rapport Z n°{String(selectedZReport.report_number).padStart(6, '0')}</h2>
                <p className="text-gray-500">{formatDate(selectedZReport.period_start)}</p>
              </div>
              <button onClick={() => setSelectedZReport(null)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-orange-50 rounded-xl p-6 text-center">
                <p className="text-gray-600 mb-2">Chiffre d'affaires TTC</p>
                <p className="text-5xl font-bold text-orange-500">{formatCurrency(selectedZReport.total_ttc)}</p>
                <p className="text-gray-500 mt-2">{selectedZReport.orders_count} commande(s)</p>
              </div>

              <div>
                <h3 className="font-bold text-lg mb-3">📊 Ventilation TVA</h3>
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3">Taux</th>
                      <th className="text-right p-3">Base HT</th>
                      <th className="text-right p-3">TVA</th>
                      <th className="text-right p-3">TTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedZReport.vat_breakdown?.map((v: any) => (
                      <tr key={v.rate} className="border-b">
                        <td className="p-3 font-medium">{v.rate}%</td>
                        <td className="p-3 text-right">{formatCurrency(v.base_ht)}</td>
                        <td className="p-3 text-right">{formatCurrency(v.tva_amount)}</td>
                        <td className="p-3 text-right font-bold">{formatCurrency(v.total_ttc)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td className="p-3">TOTAL</td>
                      <td className="p-3 text-right">{formatCurrency(selectedZReport.total_ht)}</td>
                      <td className="p-3 text-right">{formatCurrency(selectedZReport.total_tva)}</td>
                      <td className="p-3 text-right text-orange-500">{formatCurrency(selectedZReport.total_ttc)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {selectedZReport.top_products?.length > 0 && (
                <div>
                  <h3 className="font-bold text-lg mb-3">🏆 Top produits</h3>
                  <div className="space-y-2">
                    {selectedZReport.top_products.map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                        <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold">{i + 1}</span>
                        <span className="flex-1">{p.product_name}</span>
                        <span className="text-gray-500">x{p.quantity}</span>
                        <span className="font-bold">{formatCurrency(p.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-500 pt-4 border-t">
                <p>Clôturé le: {new Date(selectedZReport.closed_at).toLocaleString('fr-BE')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}