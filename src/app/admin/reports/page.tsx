'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

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
  closed_at: string
  closed_by: string
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'z-reports'>('dashboard')
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  const [stats, setStats] = useState<DailyStats[]>([])
  const [zReports, setZReports] = useState<ZReport[]>([])
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState({
    orders: 0,
    ht: 0,
    tva: 0,
    ttc: 0,
    eat_in: 0,
    takeaway: 0,
    delivery: 0,
    cash: 0,
    card: 0
  })

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadData()
  }, [dateRange])

  async function loadData() {
    setLoading(true)
    
    // Charger les commandes pour les stats
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('establishment_id', establishmentId)
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end + 'T23:59:59')
      .eq('payment_status', 'paid')
      .not('status', 'in', '("cancelled","refunded")')
      .order('created_at', { ascending: true })

    // Grouper par jour
    const dailyMap = new Map<string, DailyStats>()
    
    ;(orders || []).forEach((order: any) => {
      const date = order.created_at.split('T')[0]
      const existing = dailyMap.get(date) || {
        date,
        orders_count: 0,
        total_ht: 0,
        total_tva: 0,
        total_ttc: 0,
        eat_in_count: 0,
        eat_in_total: 0,
        takeaway_count: 0,
        takeaway_total: 0,
        delivery_count: 0,
        delivery_total: 0,
        cash_count: 0,
        cash_total: 0,
        card_count: 0,
        card_total: 0
      }

      existing.orders_count++
      
      // Utiliser les bons champs : total (TTC) et subtotal (HT)
      const ttc = Number(order.total) || 0
      const ht = Number(order.subtotal) || 0
      const tva = ttc - ht
      
      existing.total_ttc += ttc
      existing.total_ht += ht
      existing.total_tva += tva

      // Type de commande
      if (order.order_type === 'eat_in') {
        existing.eat_in_count++
        existing.eat_in_total += ttc
      } else if (order.order_type === 'delivery') {
        existing.delivery_count++
        existing.delivery_total += ttc
      } else {
        existing.takeaway_count++
        existing.takeaway_total += ttc
      }

      // Mode de paiement
      if (order.payment_method === 'cash') {
        existing.cash_count++
        existing.cash_total += ttc
      } else {
        existing.card_count++
        existing.card_total += ttc
      }

      dailyMap.set(date, existing)
    })

    const dailyStats = Array.from(dailyMap.values())
    setStats(dailyStats)

    // Calculer les totaux
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

    // Charger les rapports Z
    const { data: zData } = await supabase
      .from('z_reports')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('closed_at', { ascending: false })
      .limit(50)

    setZReports(zData || [])
    setLoading(false)
  }

  async function exportExcel() {
    // Charger toutes les commandes avec items pour l'export
    const { data: orders } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('establishment_id', establishmentId)
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end + 'T23:59:59')
      .eq('payment_status', 'paid')
      .not('status', 'in', '("cancelled","refunded")')
      .order('created_at', { ascending: true })

    if (!orders || orders.length === 0) {
      alert('Aucune donnée à exporter')
      return
    }

    // Format RestoMax - 22 colonnes
    const rows: any[][] = []
    
    // Header
    rows.push([
      'Date', 'Heure', 'N° Ticket', 'Type', 'Article', 'Quantité', 'Prix Unit. HT',
      'Prix Unit. TTC', 'Total HT', 'Total TTC', 'TVA %', 'TVA €',
      'Paiement', 'Statut', 'Source', 'Client', 'Téléphone', 'Adresse',
      'Notes', 'Livreur', 'Heure Prévue', 'N° Commande'
    ])

    ;(orders as any[]).forEach(order => {
      const date = new Date(order.created_at)
      const dateStr = date.toLocaleDateString('fr-BE')
      const timeStr = date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
      
      const orderType = order.order_type === 'eat_in' ? 'Sur place' :
                        order.order_type === 'delivery' ? 'Livraison' : 'Emporter'
      
      const paymentMethod = order.payment_method === 'cash' ? 'Espèces' : 'Carte'
      
      const source = order.source === 'kiosk' ? 'Borne' :
                     order.source === 'counter' ? 'Caisse' :
                     order.source === 'click_collect' ? 'Click&Collect' : order.source || ''

      ;(order.order_items || []).forEach((item: any) => {
        const vatRate = item.vat_rate || 21
        const totalTTC = Number(item.line_total) || 0
        const totalHT = totalTTC / (1 + vatRate / 100)
        const tvaAmount = totalTTC - totalHT
        const unitTTC = totalTTC / (item.quantity || 1)
        const unitHT = totalHT / (item.quantity || 1)

        rows.push([
          dateStr,
          timeStr,
          order.order_number || order.id.slice(0, 8),
          orderType,
          item.product_name || 'Article',
          item.quantity || 1,
          unitHT.toFixed(2),
          unitTTC.toFixed(2),
          totalHT.toFixed(2),
          totalTTC.toFixed(2),
          vatRate,
          tvaAmount.toFixed(2),
          paymentMethod,
          order.status,
          source,
          order.customer_name || '',
          order.customer_phone || '',
          order.delivery_address || '',
          order.notes || '',
          order.driver_name || '',
          order.scheduled_time ? new Date(order.scheduled_time).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '',
          order.id
        ])
      })
    })

    // Créer le workbook
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)

    // Largeurs de colonnes
    ws['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 30 },
      { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 36 }
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Ventes')

    // Feuille résumé
    const summaryRows = [
      ['RÉSUMÉ PÉRIODE', `${dateRange.start} - ${dateRange.end}`],
      [],
      ['Total Commandes', totals.orders],
      ['Total HT', totals.ht.toFixed(2) + ' €'],
      ['Total TVA', totals.tva.toFixed(2) + ' €'],
      ['Total TTC', totals.ttc.toFixed(2) + ' €'],
      [],
      ['PAR TYPE'],
      ['Sur place', totals.eat_in.toFixed(2) + ' €'],
      ['Emporter', totals.takeaway.toFixed(2) + ' €'],
      ['Livraison', totals.delivery.toFixed(2) + ' €'],
      [],
      ['PAR PAIEMENT'],
      ['Espèces', totals.cash.toFixed(2) + ' €'],
      ['Carte', totals.card.toFixed(2) + ' €']
    ]
    
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Résumé')

    // Télécharger
    const fileName = `FritOS_Export_${dateRange.start}_${dateRange.end}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('fr-BE')
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rapports</h1>
          <p className="text-gray-500">Statistiques et exports</p>
        </div>
        <button
          onClick={exportExcel}
          className="bg-green-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          📊 Export Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            activeTab === 'dashboard'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📈 Dashboard
        </button>
        <button
          onClick={() => setActiveTab('z-reports')}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            activeTab === 'z-reports'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          🧾 Rapports Z
        </button>
      </div>

      {/* Filtres date */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-4">
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
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0]
                setDateRange({ start: today, end: today })
              }}
              className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm"
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => {
                const today = new Date()
                const start = new Date(today.setDate(today.getDate() - 7)).toISOString().split('T')[0]
                setDateRange({ start, end: new Date().toISOString().split('T')[0] })
              }}
              className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm"
            >
              7 jours
            </button>
            <button
              onClick={() => {
                const today = new Date()
                const start = new Date(today.setDate(today.getDate() - 30)).toISOString().split('T')[0]
                setDateRange({ start, end: new Date().toISOString().split('T')[0] })
              }}
              className="px-4 py-2 bg-gray-100 rounded-xl hover:bg-gray-200 text-sm"
            >
              30 jours
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : activeTab === 'dashboard' ? (
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
                  <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">Commandes</th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">HT</th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">TVA</th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">TTC</th>
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
                  </tr>
                ))}
                {stats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      Aucune donnée pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Rapports Z */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Historique des clôtures</h3>
            <p className="text-sm text-gray-500">Générées automatiquement chaque nuit à 2h</p>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">N°</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Période</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">Commandes</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">HT</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">TVA</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">TTC</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Clôturé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {zReports.map(report => (
                <tr key={report.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="bg-gray-100 px-3 py-1 rounded-lg font-mono text-sm">
                      Z-{String(report.report_number).padStart(4, '0')}
                    </span>
                  </td>
                  <td className="px-6 py-4">{formatDate(report.period_start)}</td>
                  <td className="px-6 py-4 text-right">{report.orders_count}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(report.total_ht)}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(report.total_tva)}</td>
                  <td className="px-6 py-4 text-right font-semibold">{formatCurrency(report.total_ttc)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(report.closed_at).toLocaleString('fr-BE')}
                    <br />
                    <span className="text-xs">{report.closed_by}</span>
                  </td>
                </tr>
              ))}
              {zReports.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    Aucun rapport Z généré
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}