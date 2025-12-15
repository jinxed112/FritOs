'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'

type OrderWithItems = {
  id: string
  order_number: string
  order_type: 'eat_in' | 'takeaway' | 'kiosk' | 'counter' | 'pickup' | 'delivery'
  status: string
  subtotal: number
  tax_amount: number
  total_amount: number
  payment_method: string
  payment_status: string
  source: string
  created_at: string
  order_items: {
    id: string
    product_id: string
    product_name: string
    quantity: number
    unit_price: number
    line_total: number
    vat_rate: number
    options_total: number
  }[]
}

type DailySummary = {
  date: string
  orders_count: number
  total_ht: number
  total_tva: number
  total_ttc: number
  eat_in_count: number
  eat_in_total: number
  takeaway_count: number
  takeaway_total: number
  cash_total: number
  card_total: number
  avg_basket: number
}

type ProductSales = {
  product_id: string
  product_name: string
  quantity: number
  total: number
  percentage: number
}

type HourlySales = {
  hour: number
  count: number
  total: number
}

type VatBreakdown = {
  rate: number
  base_ht: number
  tva_amount: number
  total_ttc: number
}

type ReportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
type ReportTab = 'z-report' | 'sales' | 'products' | 'hourly' | 'comparison'

export default function ReportsPage() {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ReportTab>('z-report')
  const [period, setPeriod] = useState<ReportPeriod>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [showPrintModal, setShowPrintModal] = useState(false)
  
  // Établissement info
  const [establishment, setEstablishment] = useState<any>(null)

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadEstablishment()
  }, [])

  useEffect(() => {
    loadOrders()
  }, [period, customStart, customEnd])

  async function loadEstablishment() {
    const { data } = await supabase
      .from('establishments')
      .select('name, address, phone, vat_number')
      .eq('id', establishmentId)
      .single()
    
    setEstablishment(data)
  }

  function getDateRange(): { start: Date; end: Date } {
    const now = new Date()
    
    switch (period) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) }
      case 'yesterday':
        const yesterday = subDays(now, 1)
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
      case 'week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfDay(now) }
      case 'month':
        return { start: startOfMonth(now), end: endOfDay(now) }
      case 'custom':
        return {
          start: customStart ? startOfDay(new Date(customStart)) : startOfDay(now),
          end: customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now),
        }
      default:
        return { start: startOfDay(now), end: endOfDay(now) }
    }
  }

  async function loadOrders() {
    setLoading(true)
    
    const { start, end } = getDateRange()
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        order_type,
        status,
        subtotal,
        tax_amount,
        total_amount,
        payment_method,
        payment_status,
        source,
        created_at,
        order_items (
          id,
          product_id,
          product_name,
          quantity,
          unit_price,
          line_total,
          vat_rate,
          options_total
        )
      `)
      .eq('establishment_id', establishmentId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .in('status', ['completed', 'ready', 'preparing', 'pending'])
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erreur chargement:', error)
    } else {
      setOrders(data || [])
    }
    
    setLoading(false)
  }

  // === CALCULS ===

  function calculateTotals() {
    const validOrders = orders.filter(o => o.payment_status === 'paid')
    
    const totalTTC = validOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const totalTVA = validOrders.reduce((sum, o) => sum + (o.tax_amount || 0), 0)
    const totalHT = totalTTC - totalTVA
    
    const eatInOrders = validOrders.filter(o => o.order_type === 'eat_in')
    const takeawayOrders = validOrders.filter(o => o.order_type !== 'eat_in')
    
    const cashOrders = validOrders.filter(o => o.payment_method === 'cash')
    const cardOrders = validOrders.filter(o => o.payment_method === 'card')
    
    return {
      orders_count: validOrders.length,
      total_ht: totalHT,
      total_tva: totalTVA,
      total_ttc: totalTTC,
      eat_in: {
        count: eatInOrders.length,
        total: eatInOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      },
      takeaway: {
        count: takeawayOrders.length,
        total: takeawayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      },
      cash: {
        count: cashOrders.length,
        total: cashOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      },
      card: {
        count: cardOrders.length,
        total: cardOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      },
      avg_basket: validOrders.length > 0 ? totalTTC / validOrders.length : 0,
    }
  }

  function calculateVatBreakdown(): VatBreakdown[] {
    const vatMap: Record<number, { base: number; tva: number }> = {}
    
    orders.forEach(order => {
      order.order_items?.forEach(item => {
        const rate = item.vat_rate || (order.order_type === 'eat_in' ? 12 : 6)
        const lineTotal = item.line_total || (item.unit_price + (item.options_total || 0)) * item.quantity
        
        // Prix TTC, calculer HT et TVA
        const tvaAmount = lineTotal * rate / (100 + rate)
        const htAmount = lineTotal - tvaAmount
        
        if (!vatMap[rate]) {
          vatMap[rate] = { base: 0, tva: 0 }
        }
        vatMap[rate].base += htAmount
        vatMap[rate].tva += tvaAmount
      })
    })
    
    return Object.entries(vatMap)
      .map(([rate, values]) => ({
        rate: parseFloat(rate),
        base_ht: values.base,
        tva_amount: values.tva,
        total_ttc: values.base + values.tva,
      }))
      .sort((a, b) => a.rate - b.rate)
  }

  function calculateProductSales(): ProductSales[] {
    const productMap: Record<string, { name: string; qty: number; total: number }> = {}
    
    orders.forEach(order => {
      order.order_items?.forEach(item => {
        const key = item.product_id || item.product_name
        if (!productMap[key]) {
          productMap[key] = { name: item.product_name, qty: 0, total: 0 }
        }
        productMap[key].qty += item.quantity
        productMap[key].total += item.line_total || 0
      })
    })
    
    const totalSales = Object.values(productMap).reduce((sum, p) => sum + p.total, 0)
    
    return Object.entries(productMap)
      .map(([id, data]) => ({
        product_id: id,
        product_name: data.name,
        quantity: data.qty,
        total: data.total,
        percentage: totalSales > 0 ? (data.total / totalSales) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }

  function calculateHourlySales(): HourlySales[] {
    const hourlyMap: Record<number, { count: number; total: number }> = {}
    
    // Initialiser toutes les heures
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { count: 0, total: 0 }
    }
    
    orders.forEach(order => {
      const hour = new Date(order.created_at).getHours()
      hourlyMap[hour].count += 1
      hourlyMap[hour].total += order.total_amount || 0
    })
    
    return Object.entries(hourlyMap)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        count: data.count,
        total: data.total,
      }))
      .filter(h => h.count > 0 || (h.hour >= 11 && h.hour <= 22)) // Afficher heures d'ouverture
  }

  function calculateSourceBreakdown() {
    const sourceMap: Record<string, { count: number; total: number }> = {}
    
    orders.forEach(order => {
      const source = order.source || 'unknown'
      if (!sourceMap[source]) {
        sourceMap[source] = { count: 0, total: 0 }
      }
      sourceMap[source].count += 1
      sourceMap[source].total += order.total_amount || 0
    })
    
    return Object.entries(sourceMap).map(([source, data]) => ({
      source,
      label: source === 'kiosk' ? '🖥️ Borne' : 
             source === 'counter' ? '📋 Caisse' :
             source === 'online' ? '🌐 En ligne' : source,
      count: data.count,
      total: data.total,
    }))
  }

  // === RENDER ===

  const totals = calculateTotals()
  const vatBreakdown = calculateVatBreakdown()
  const productSales = calculateProductSales()
  const hourlySales = calculateHourlySales()
  const sourceBreakdown = calculateSourceBreakdown()
  const { start, end } = getDateRange()

  const periodLabel = period === 'today' ? "Aujourd'hui" :
                      period === 'yesterday' ? 'Hier' :
                      period === 'week' ? 'Cette semaine' :
                      period === 'month' ? 'Ce mois' :
                      `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📊 Rapports & Analyses</h1>
          <p className="text-gray-500">{periodLabel} • {totals.orders_count} commande(s)</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Période */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
            className="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="today">Aujourd'hui</option>
            <option value="yesterday">Hier</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="custom">Personnalisé</option>
          </select>
          
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200"
              />
              <span className="text-gray-400">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200"
              />
            </>
          )}
          
          <button
            onClick={() => setShowPrintModal(true)}
            className="bg-orange-500 text-white font-semibold px-6 py-2 rounded-xl hover:bg-orange-600 flex items-center gap-2"
          >
            🖨️ Imprimer
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        {[
          { key: 'z-report', label: '📋 Rapport Z', icon: '📋' },
          { key: 'sales', label: '💰 Ventes', icon: '💰' },
          { key: 'products', label: '🍔 Produits', icon: '🍔' },
          { key: 'hourly', label: '⏰ Horaires', icon: '⏰' },
          { key: 'comparison', label: '📈 Comparaison', icon: '📈' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as ReportTab)}
            className={`px-4 py-2 rounded-t-xl font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
          Chargement des données...
        </div>
      ) : (
        <>
          {/* === RAPPORT Z === */}
          {activeTab === 'z-report' && (
            <div className="space-y-6">
              {/* En-tête rapport */}
              <div className="bg-white rounded-2xl p-6 border-2 border-gray-900">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold">RAPPORT Z - CLÔTURE DE CAISSE</h2>
                  <p className="text-gray-600">{establishment?.name || 'MDjambo'}</p>
                  <p className="text-sm text-gray-500">{establishment?.address}</p>
                  <p className="text-sm text-gray-500">TVA: {establishment?.vat_number}</p>
                  <div className="mt-4 text-lg font-mono">
                    <p>Période: {format(start, 'dd/MM/yyyy HH:mm', { locale: fr })} - {format(end, 'dd/MM/yyyy HH:mm', { locale: fr })}</p>
                    <p>Généré le: {format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: fr })}</p>
                  </div>
                </div>
                
                <div className="border-t-2 border-dashed border-gray-300 my-4"></div>
                
                {/* Résumé général */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-gray-600 text-sm">Nombre de tickets</p>
                    <p className="text-3xl font-bold">{totals.orders_count}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-gray-600 text-sm">Panier moyen</p>
                    <p className="text-3xl font-bold">{totals.avg_basket.toFixed(2)} €</p>
                  </div>
                </div>
                
                {/* Ventilation TVA */}
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    📊 VENTILATION TVA
                  </h3>
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left p-3">Taux TVA</th>
                        <th className="text-right p-3">Base HT</th>
                        <th className="text-right p-3">Montant TVA</th>
                        <th className="text-right p-3">Total TTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatBreakdown.map(vat => (
                        <tr key={vat.rate} className="border-b">
                          <td className="p-3 font-medium">{vat.rate}%</td>
                          <td className="p-3 text-right font-mono">{vat.base_ht.toFixed(2)} €</td>
                          <td className="p-3 text-right font-mono">{vat.tva_amount.toFixed(2)} €</td>
                          <td className="p-3 text-right font-mono font-bold">{vat.total_ttc.toFixed(2)} €</td>
                        </tr>
                      ))}
                      <tr className="bg-orange-50 font-bold">
                        <td className="p-3">TOTAL</td>
                        <td className="p-3 text-right font-mono">{totals.total_ht.toFixed(2)} €</td>
                        <td className="p-3 text-right font-mono">{totals.total_tva.toFixed(2)} €</td>
                        <td className="p-3 text-right font-mono text-orange-600">{totals.total_ttc.toFixed(2)} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Ventilation par mode de consommation */}
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-3">🍽️ PAR MODE DE CONSOMMATION</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🍽️</span>
                        <span className="font-bold">Sur place (TVA 12%)</span>
                      </div>
                      <p className="text-sm text-gray-600">{totals.eat_in.count} commande(s)</p>
                      <p className="text-2xl font-bold text-blue-600">{totals.eat_in.total.toFixed(2)} €</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🥡</span>
                        <span className="font-bold">À emporter (TVA 6%)</span>
                      </div>
                      <p className="text-sm text-gray-600">{totals.takeaway.count} commande(s)</p>
                      <p className="text-2xl font-bold text-green-600">{totals.takeaway.total.toFixed(2)} €</p>
                    </div>
                  </div>
                </div>
                
                {/* Ventilation par mode de paiement */}
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-3">💳 PAR MODE DE PAIEMENT</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">💵</span>
                        <span className="font-bold">Espèces</span>
                      </div>
                      <p className="text-sm text-gray-600">{totals.cash.count} transaction(s)</p>
                      <p className="text-2xl font-bold text-emerald-600">{totals.cash.total.toFixed(2)} €</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">💳</span>
                        <span className="font-bold">Carte bancaire</span>
                      </div>
                      <p className="text-sm text-gray-600">{totals.card.count} transaction(s)</p>
                      <p className="text-2xl font-bold text-purple-600">{totals.card.total.toFixed(2)} €</p>
                    </div>
                  </div>
                </div>
                
                {/* Ventilation par source */}
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-3">📱 PAR CANAL DE VENTE</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {sourceBreakdown.map(source => (
                      <div key={source.source} className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold">{source.label}</span>
                        </div>
                        <p className="text-sm text-gray-600">{source.count} commande(s)</p>
                        <p className="text-xl font-bold">{source.total.toFixed(2)} €</p>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Total final */}
                <div className="border-t-2 border-dashed border-gray-300 pt-4">
                  <div className="bg-orange-500 text-white rounded-xl p-6 text-center">
                    <p className="text-xl mb-2">CHIFFRE D'AFFAIRES TTC</p>
                    <p className="text-5xl font-bold">{totals.total_ttc.toFixed(2)} €</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === VENTES === */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <p className="text-gray-500 text-sm mb-1">Chiffre d'affaires</p>
                  <p className="text-3xl font-bold text-orange-500">{totals.total_ttc.toFixed(2)} €</p>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <p className="text-gray-500 text-sm mb-1">Nombre de tickets</p>
                  <p className="text-3xl font-bold">{totals.orders_count}</p>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <p className="text-gray-500 text-sm mb-1">Panier moyen</p>
                  <p className="text-3xl font-bold text-blue-500">{totals.avg_basket.toFixed(2)} €</p>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <p className="text-gray-500 text-sm mb-1">TVA collectée</p>
                  <p className="text-3xl font-bold text-green-500">{totals.total_tva.toFixed(2)} €</p>
                </div>
              </div>
              
              {/* Liste des commandes */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-bold text-lg">📋 Détail des commandes</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-3">N°</th>
                        <th className="text-left p-3">Heure</th>
                        <th className="text-left p-3">Type</th>
                        <th className="text-left p-3">Source</th>
                        <th className="text-left p-3">Paiement</th>
                        <th className="text-right p-3">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.slice(0, 50).map(order => (
                        <tr key={order.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-mono font-bold">{order.order_number}</td>
                          <td className="p-3 text-gray-600">
                            {format(new Date(order.created_at), 'HH:mm')}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              order.order_type === 'eat_in' 
                                ? 'bg-blue-100 text-blue-700' 
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {order.order_type === 'eat_in' ? '🍽️ Sur place' : '🥡 Emporter'}
                            </span>
                          </td>
                          <td className="p-3 text-gray-600">
                            {order.source === 'kiosk' ? '🖥️ Borne' : 
                             order.source === 'counter' ? '📋 Caisse' : order.source}
                          </td>
                          <td className="p-3">
                            {order.payment_method === 'cash' ? '💵 Espèces' : '💳 Carte'}
                          </td>
                          <td className="p-3 text-right font-bold font-mono">
                            {(order.total_amount || 0).toFixed(2)} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {orders.length > 50 && (
                  <div className="p-4 text-center text-gray-500">
                    Affichage limité aux 50 premières commandes
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === PRODUITS === */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-bold text-lg">🏆 Top produits</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3">#</th>
                      <th className="text-left p-3">Produit</th>
                      <th className="text-right p-3">Quantité</th>
                      <th className="text-right p-3">CA</th>
                      <th className="text-right p-3">%</th>
                      <th className="p-3">Répartition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productSales.slice(0, 20).map((product, index) => (
                      <tr key={product.product_id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-bold text-gray-400">{index + 1}</td>
                        <td className="p-3 font-medium">{product.product_name}</td>
                        <td className="p-3 text-right font-mono">{product.quantity}</td>
                        <td className="p-3 text-right font-mono font-bold">{product.total.toFixed(2)} €</td>
                        <td className="p-3 text-right text-gray-500">{product.percentage.toFixed(1)}%</td>
                        <td className="p-3">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-orange-500 h-2 rounded-full"
                              style={{ width: `${Math.min(100, product.percentage)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* === HORAIRES === */}
          {activeTab === 'hourly' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="font-bold text-lg mb-4">⏰ Ventes par heure</h3>
                
                {/* Graphique simple en barres */}
                <div className="space-y-2">
                  {hourlySales.map(hour => {
                    const maxTotal = Math.max(...hourlySales.map(h => h.total))
                    const percentage = maxTotal > 0 ? (hour.total / maxTotal) * 100 : 0
                    
                    return (
                      <div key={hour.hour} className="flex items-center gap-3">
                        <span className="w-16 text-right font-mono text-gray-600">
                          {hour.hour.toString().padStart(2, '0')}:00
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                          <div 
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-400 to-orange-500 rounded-full flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(percentage, hour.count > 0 ? 5 : 0)}%` }}
                          >
                            {hour.count > 0 && (
                              <span className="text-white text-xs font-bold">
                                {hour.total.toFixed(0)}€
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="w-20 text-right text-gray-500">
                          {hour.count} cmd
                        </span>
                      </div>
                    )
                  })}
                </div>
                
                {/* Heures de pointe */}
                <div className="mt-6 p-4 bg-orange-50 rounded-xl">
                  <h4 className="font-bold text-orange-800 mb-2">🔥 Heures de pointe</h4>
                  <div className="flex gap-4">
                    {hourlySales
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 3)
                      .map((hour, index) => (
                        <div key={hour.hour} className="bg-white rounded-lg p-3 flex-1">
                          <span className="text-2xl">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </span>
                          <p className="font-bold">{hour.hour}:00 - {hour.hour + 1}:00</p>
                          <p className="text-sm text-gray-600">{hour.count} cmd • {hour.total.toFixed(2)}€</p>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === COMPARAISON === */}
          {activeTab === 'comparison' && (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-400">
              <span className="text-6xl block mb-4">📈</span>
              <p className="text-xl">Comparaison avec périodes précédentes</p>
              <p className="text-sm mt-2">Fonctionnalité à venir</p>
            </div>
          )}
        </>
      )}

      {/* Modal impression */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">🖨️ Imprimer le rapport</h2>
            
            <div className="space-y-3 mb-6">
              <button
                onClick={() => {
                  window.print()
                  setShowPrintModal(false)
                }}
                className="w-full p-4 rounded-xl border border-gray-200 hover:bg-gray-50 text-left flex items-center gap-3"
              >
                <span className="text-2xl">📋</span>
                <div>
                  <p className="font-bold">Rapport Z complet</p>
                  <p className="text-sm text-gray-500">Format A4</p>
                </div>
              </button>
              
              <button
                onClick={() => {
                  // Ouvrir dans nouvelle fenêtre format ticket
                  const printContent = document.querySelector('[data-print="z-report"]')
                  if (printContent) {
                    const printWindow = window.open('', '_blank')
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Rapport Z - ${periodLabel}</title>
                            <style>
                              body { font-family: 'Courier New', monospace; width: 80mm; margin: 0; padding: 10px; }
                              .center { text-align: center; }
                              .bold { font-weight: bold; }
                              .line { border-top: 1px dashed #000; margin: 10px 0; }
                              table { width: 100%; border-collapse: collapse; }
                              td { padding: 2px 0; }
                              .right { text-align: right; }
                            </style>
                          </head>
                          <body>
                            <div class="center bold">${establishment?.name || 'MDjambo'}</div>
                            <div class="center">${establishment?.address || ''}</div>
                            <div class="center">TVA: ${establishment?.vat_number || ''}</div>
                            <div class="line"></div>
                            <div class="center bold">RAPPORT Z</div>
                            <div class="center">${periodLabel}</div>
                            <div class="center">${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                            <div class="line"></div>
                            <table>
                              <tr><td>Nb tickets:</td><td class="right">${totals.orders_count}</td></tr>
                              <tr><td>Panier moyen:</td><td class="right">${totals.avg_basket.toFixed(2)}€</td></tr>
                            </table>
                            <div class="line"></div>
                            <div class="bold">VENTILATION TVA</div>
                            ${vatBreakdown.map(v => `
                              <table>
                                <tr><td>TVA ${v.rate}%:</td><td class="right">${v.tva_amount.toFixed(2)}€</td></tr>
                              </table>
                            `).join('')}
                            <div class="line"></div>
                            <table>
                              <tr><td>Sur place:</td><td class="right">${totals.eat_in.total.toFixed(2)}€</td></tr>
                              <tr><td>Emporter:</td><td class="right">${totals.takeaway.total.toFixed(2)}€</td></tr>
                            </table>
                            <div class="line"></div>
                            <table>
                              <tr><td>Espèces:</td><td class="right">${totals.cash.total.toFixed(2)}€</td></tr>
                              <tr><td>Carte:</td><td class="right">${totals.card.total.toFixed(2)}€</td></tr>
                            </table>
                            <div class="line"></div>
                            <div class="center bold" style="font-size: 1.5em;">
                              TOTAL: ${totals.total_ttc.toFixed(2)}€
                            </div>
                            <div class="line"></div>
                            <div class="center">FritOS v1.0</div>
                          </body>
                        </html>
                      `)
                      printWindow.document.close()
                      printWindow.print()
                    }
                  }
                  setShowPrintModal(false)
                }}
                className="w-full p-4 rounded-xl border border-gray-200 hover:bg-gray-50 text-left flex items-center gap-3"
              >
                <span className="text-2xl">🧾</span>
                <div>
                  <p className="font-bold">Ticket 80mm</p>
                  <p className="text-sm text-gray-500">Format thermique</p>
                </div>
              </button>
              
              <button
                onClick={() => {
                  // Export CSV
                  const csv = [
                    ['Commande', 'Date', 'Heure', 'Type', 'Paiement', 'HT', 'TVA', 'TTC'].join(';'),
                    ...orders.map(o => [
                      o.order_number,
                      format(new Date(o.created_at), 'dd/MM/yyyy'),
                      format(new Date(o.created_at), 'HH:mm'),
                      o.order_type === 'eat_in' ? 'Sur place' : 'Emporter',
                      o.payment_method === 'cash' ? 'Espèces' : 'Carte',
                      ((o.total_amount || 0) - (o.tax_amount || 0)).toFixed(2),
                      (o.tax_amount || 0).toFixed(2),
                      (o.total_amount || 0).toFixed(2),
                    ].join(';'))
                  ].join('\n')
                  
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `rapport-${format(start, 'yyyy-MM-dd')}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                  setShowPrintModal(false)
                }}
                className="w-full p-4 rounded-xl border border-gray-200 hover:bg-gray-50 text-left flex items-center gap-3"
              >
                <span className="text-2xl">📊</span>
                <div>
                  <p className="font-bold">Export CSV</p>
                  <p className="text-sm text-gray-500">Pour Excel/comptabilité</p>
                </div>
              </button>
            </div>
            
            <button
              onClick={() => setShowPrintModal(false)}
              className="w-full py-3 rounded-xl border border-gray-200 font-semibold"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
