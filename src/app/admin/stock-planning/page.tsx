'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────
type StockItem = {
  id: string
  name: string
  stock_type: 'fresh' | 'frozen'
  pack_weight_g: number | null
  portion_weight_g: number | null
  dlc_days: number
}

type StockMapping = {
  product_id: string
  stock_item_id: string
  portions_per_order: number
}

type DefrostLog = {
  id: string
  stock_item_id: string
  quantity: number
  defrosted_at: string
  expires_at: string
  notes: string | null
}

type DayAvg = { [day: number]: number } // 0=Sun, 1=Mon, ... 6=Sat → we'll use ISO: 1=Mon..7=Sun

type StockPlan = {
  item: StockItem
  avgPerDay: { [isoDay: number]: number }
  currentStock: number
  expiringToday: number
  neededTomorrow: number      // portions prévues pour demain
  inFridge: number            // ce qui est dispo dans le frigo pour demain
  delta: number               // négatif = il manque, positif = surplus
  packsNeeded: number | null
  portionsPerPack: number | null
}

type ActiveTab = 'planning' | 'defrost' | 'config'

const DAY_NAMES = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DAY_SHORT = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function isoDay(date: Date): number {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtDateISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ─── Component ───────────────────────────────────────────────────────
export default function StockPlanningPage() {
  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('planning')
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [mappings, setMappings] = useState<StockMapping[]>([])
  const [defrostLogs, setDefrostLogs] = useState<DefrostLog[]>([])
  const [avgData, setAvgData] = useState<{ [stockItemId: string]: { [isoDay: number]: number } }>({})
  const [margin, setMargin] = useState(0.2)
  const [weeksBack, setWeeksBack] = useState(8)

  // Defrost form
  const [showDefrostModal, setShowDefrostModal] = useState(false)
  const [defrostItemId, setDefrostItemId] = useState('')
  const [defrostQty, setDefrostQty] = useState(1)
  const [defrostNotes, setDefrostNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // ─── Load all data ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)

    // 1. Stock items
    const { data: items } = await supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', establishmentId)
      .order('stock_type')
      .order('name')

    // 2. Mappings
    const { data: maps } = await supabase
      .from('product_stock_mapping')
      .select('product_id, stock_item_id, portions_per_order')

    // 3. Active defrost logs (not expired)
    const { data: logs } = await supabase
      .from('stock_defrost_logs')
      .select('*')
      .eq('establishment_id', establishmentId)
      .gte('expires_at', new Date().toISOString())
      .order('defrosted_at', { ascending: false })

    // 4. Sales averages — query orders from last N weeks
    const since = addDays(new Date(), -weeksBack * 7).toISOString()
    const { data: salesData } = await supabase.rpc('get_stock_daily_averages', {
      p_establishment_id: establishmentId,
      p_since: since,
      p_test_phone: '+32497753554'
    })

    // If RPC doesn't exist yet, fall back to client-side calculation
    let avgs: { [stockItemId: string]: { [isoDay: number]: number } } = {}

    if (salesData && salesData.length > 0) {
      // RPC returned data
      for (const row of salesData) {
        if (!avgs[row.stock_item_id]) avgs[row.stock_item_id] = {}
        avgs[row.stock_item_id][row.iso_day] = parseFloat(row.avg_portions)
      }
    } else {
      // Fallback: query raw orders and calculate client-side
      const { data: orderData } = await supabase
        .from('order_items')
        .select(`
          quantity,
          product_id,
          orders!inner(id, created_at, status, customer_phone, establishment_id)
        `)
        .eq('orders.establishment_id', establishmentId)
        .not('orders.status', 'in', '("cancelled","refunded","awaiting_payment")')
        .neq('orders.customer_phone', '+32497753554')
        .gte('orders.created_at', since)

      if (orderData && maps) {
        // Build mapping lookup: product_id → [{ stock_item_id, portions_per_order }]
        const mapLookup: { [pid: string]: { sid: string; mult: number }[] } = {}
        for (const m of maps) {
          if (!mapLookup[m.product_id]) mapLookup[m.product_id] = []
          mapLookup[m.product_id].push({ sid: m.stock_item_id, mult: m.portions_per_order })
        }

        // Accumulate per stock_item per iso_day
        const totals: { [sid: string]: { [day: number]: number } } = {}
        const dayCounts: { [day: number]: Set<string> } = {}

        for (const oi of orderData) {
          const order = oi.orders as any
          const date = new Date(order.created_at)
          const day = isoDay(date)
          const dateStr = fmtDateISO(date)

          if (!dayCounts[day]) dayCounts[day] = new Set()
          dayCounts[day].add(dateStr)

          const mappingsForProduct = mapLookup[oi.product_id]
          if (!mappingsForProduct) continue

          for (const mp of mappingsForProduct) {
            if (!totals[mp.sid]) totals[mp.sid] = {}
            totals[mp.sid][day] = (totals[mp.sid][day] || 0) + oi.quantity * mp.mult
          }
        }

        // Calculate averages
        for (const sid of Object.keys(totals)) {
          avgs[sid] = {}
          for (const day of Object.keys(totals[sid]).map(Number)) {
            const count = dayCounts[day]?.size || 1
            avgs[sid][day] = totals[sid][day] / count
          }
        }
      }
    }

    setStockItems(items || [])
    setMappings(maps || [])
    setDefrostLogs(logs || [])
    setAvgData(avgs)
    setLoading(false)
  }, [weeksBack])

  useEffect(() => { loadData() }, [loadData])

  // ─── Save defrost log ──────────────────────────────────────────────
  async function saveDefrost() {
    if (!defrostItemId || defrostQty <= 0) return
    setSaving(true)

    const item = stockItems.find(i => i.id === defrostItemId)
    if (!item) { setSaving(false); return }

    const now = new Date()
    // DLC starts from tomorrow (defrost tonight, available tomorrow)
    const tomorrowMorning = addDays(now, 1)
    tomorrowMorning.setHours(23, 59, 59)
    const expires = addDays(tomorrowMorning, item.dlc_days - 1)

    await supabase.from('stock_defrost_logs').insert({
      stock_item_id: defrostItemId,
      quantity: defrostQty,
      defrosted_at: now.toISOString(),
      expires_at: expires.toISOString(),
      notes: defrostNotes || null,
      establishment_id: establishmentId,
    })

    setShowDefrostModal(false)
    setDefrostQty(1)
    setDefrostNotes('')
    setSaving(false)
    loadData()
  }

  // ─── Delete defrost log ────────────────────────────────────────────
  async function deleteLog(id: string) {
    if (!confirm('Supprimer cette entrée ?')) return
    await supabase.from('stock_defrost_logs').delete().eq('id', id)
    loadData()
  }

  // ─── Compute planning ─────────────────────────────────────────────
  function getPlanning(): StockPlan[] {
    const today = new Date()
    const tomorrow = addDays(today, 1)
    const tomorrowDay = isoDay(tomorrow)

    return stockItems.map(item => {
      const avgs = avgData[item.id] || {}

      // What's currently in the fridge (non-expired defrost logs)
      const activeLogs = defrostLogs.filter(l => l.stock_item_id === item.id)
      const currentStock = activeLogs.reduce((sum, l) => sum + l.quantity, 0)

      // Expiring today (urgent: use it or lose it)
      const todayEnd = new Date(today)
      todayEnd.setHours(23, 59, 59)
      const expiringToday = activeLogs
        .filter(l => new Date(l.expires_at) <= todayEnd)
        .reduce((sum, l) => sum + l.quantity, 0)

      // Predicted demand for tomorrow
      const neededTomorrow = Math.ceil((avgs[tomorrowDay] || 0) * (1 + margin))

      // What's in the fridge that will still be valid tomorrow
      const tomorrowStart = new Date(tomorrow)
      tomorrowStart.setHours(0, 0, 0)
      const inFridge = activeLogs
        .filter(l => new Date(l.expires_at) >= tomorrowStart)
        .reduce((sum, l) => sum + l.quantity, 0)

      // Delta: positive = surplus, negative = need to defrost/order
      const delta = inFridge - neededTomorrow

      // Packs needed for fresh items
      let portionsPerPack: number | null = null
      let packsNeeded: number | null = null
      if (item.pack_weight_g && item.portion_weight_g) {
        portionsPerPack = Math.floor(item.pack_weight_g / item.portion_weight_g)
        const deficit = Math.max(0, -delta)
        packsNeeded = deficit > 0 ? Math.ceil(deficit / portionsPerPack) : 0
      }

      return {
        item,
        avgPerDay: avgs,
        currentStock,
        expiringToday,
        neededTomorrow,
        inFridge,
        delta,
        packsNeeded,
        portionsPerPack,
      }
    })
  }

  const plans = loading ? [] : getPlanning()
  const freshPlans = plans.filter(p => p.item.stock_type === 'fresh')
  const frozenPlans = plans.filter(p => p.item.stock_type === 'frozen')
  const tomorrow = addDays(new Date(), 1)

  // ─── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">📦</div>
          <p className="text-gray-500 text-lg">Chargement du stock...</p>
        </div>
      </div>
    )
  }

  const today = new Date()

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestion du stock</h1>
          <p className="text-gray-500">Ce qu'il faut sortir ce soir pour {DAY_NAMES[isoDay(tomorrow)].toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={margin}
            onChange={e => setMargin(parseFloat(e.target.value))}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm"
          >
            <option value={0}>Marge: 0%</option>
            <option value={0.2}>Marge: +20%</option>
            <option value={0.5}>Marge: +50%</option>
          </select>
          <select
            value={weeksBack}
            onChange={e => setWeeksBack(parseInt(e.target.value))}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm"
          >
            <option value={4}>Historique: 4 sem.</option>
            <option value={8}>Historique: 8 sem.</option>
            <option value={12}>Historique: 12 sem.</option>
          </select>
          <button
            onClick={() => {
              setDefrostItemId(stockItems[0]?.id || '')
              setShowDefrostModal(true)
            }}
            className="bg-orange-500 text-white font-semibold px-6 py-2 rounded-xl hover:bg-orange-600 transition-colors"
          >
            📦 Enregistrer une sortie
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'planning' as ActiveTab, label: '📋 Planning', },
          { key: 'defrost' as ActiveTab, label: '📦 Stock actuel', },
          { key: 'config' as ActiveTab, label: '⚙️ Moyennes / jour', },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 rounded-xl font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ TAB: PLANNING ═══════════════ */}
      {activeTab === 'planning' && (
        <div className="space-y-8">
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <p className="text-sm text-gray-500">Dans le frigo pour</p>
              <p className="text-2xl font-bold text-gray-900">{DAY_NAMES[isoDay(tomorrow)]}</p>
              <p className="text-sm text-gray-400">{fmtDate(tomorrow)}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <p className="text-sm text-gray-500">Tout est prêt</p>
              <p className="text-2xl font-bold text-green-600">
                {plans.filter(p => p.delta >= 0 && p.neededTomorrow > 0).length}
              </p>
              <p className="text-sm text-gray-400">sur {plans.filter(p => p.neededTomorrow > 0).length} articles demandés</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <p className="text-sm text-gray-500">Il manque</p>
              <p className="text-2xl font-bold text-red-600">
                {plans.filter(p => p.delta < 0).length} articles
              </p>
              <p className="text-sm text-gray-400">à sortir / commander</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <p className="text-sm text-gray-500">Expire ce soir</p>
              <p className="text-2xl font-bold text-orange-600">
                {plans.reduce((s, p) => s + p.expiringToday, 0)} portions
              </p>
              <p className="text-sm text-gray-400">à écouler aujourd'hui</p>
            </div>
          </div>

          {/* ── Unified table: what's in the fridge for tomorrow ── */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Frigo pour {DAY_NAMES[isoDay(tomorrow)].toLowerCase()} {fmtDate(tomorrow)}
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              Prévision basée sur les ventes des {weeksBack} dernières semaines (marge +{Math.round(margin * 100)}%)
            </p>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Article</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600">Type</th>
                    <th className="text-center px-3 py-3 font-semibold text-blue-600 bg-blue-50">
                      Il faut demain
                    </th>
                    <th className="text-center px-3 py-3 font-semibold text-green-600 bg-green-50">
                      Dans le frigo
                    </th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600">
                      Statut
                    </th>
                    <th className="text-center px-3 py-3 font-semibold text-orange-600 bg-orange-50">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Show items that need attention first, then OK items */}
                  {[...plans]
                    .filter(p => p.neededTomorrow > 0 || p.inFridge > 0)
                    .sort((a, b) => a.delta - b.delta)
                    .map((p, i) => {
                    const missing = Math.max(0, -p.delta)
                    return (
                      <tr key={p.item.id} className={`border-b ${
                        p.delta < 0 ? 'bg-red-50' : i % 2 === 0 ? '' : 'bg-gray-50'
                      }`}>
                        <td className="px-5 py-3">
                          <span className="font-medium">{p.item.name}</span>
                          {p.portionsPerPack && (
                            <span className="block text-xs text-gray-400">
                              Pack {p.item.pack_weight_g! / 1000}kg = {p.portionsPerPack} portions
                            </span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            p.item.stock_type === 'fresh' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {p.item.stock_type === 'fresh' ? 'Frais' : 'Surgelé'}
                          </span>
                        </td>
                        <td className="text-center px-3 py-3 bg-blue-50 font-bold text-lg">
                          {p.neededTomorrow > 0 ? p.neededTomorrow : '—'}
                        </td>
                        <td className="text-center px-3 py-3 bg-green-50 font-bold text-lg">
                          {p.inFridge > 0 ? p.inFridge : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3">
                          {p.delta >= 0 && p.neededTomorrow > 0 ? (
                            <span className="inline-block px-3 py-1 rounded-full bg-green-100 text-green-700 font-semibold text-xs">
                              ✓ OK {p.delta > 0 ? `(+${p.delta})` : ''}
                            </span>
                          ) : p.delta < 0 ? (
                            <span className="inline-block px-3 py-1 rounded-full bg-red-100 text-red-700 font-semibold text-xs">
                              Manque {missing}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="text-center px-3 py-3 bg-orange-50">
                          {p.delta < 0 ? (
                            <button
                              onClick={() => {
                                setDefrostItemId(p.item.id)
                                setDefrostQty(missing)
                                setShowDefrostModal(true)
                              }}
                              className="inline-block px-3 py-1 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600 transition-colors text-xs"
                            >
                              {p.item.stock_type === 'fresh' 
                                ? `${p.packsNeeded} pack${(p.packsNeeded||0) > 1 ? 's' : ''}`
                                : `Sortir ${missing}`
                              }
                            </button>
                          ) : (
                            <span className="text-green-600">✓</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Aperçu semaine ── */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Aperçu de la semaine</h2>
            <div className="grid grid-cols-7 gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map(d => {
                const date = addDays(today, d - isoDay(today) + (d <= isoDay(today) ? 7 : 0))
                const isTomorrow = d === isoDay(tomorrow)
                const totalNeeded = plans.reduce((s, p) => s + Math.ceil((p.avgPerDay[d] || 0) * (1 + margin)), 0)
                return (
                  <div key={d} className={`rounded-xl p-3 text-center ${
                    isTomorrow 
                      ? 'bg-orange-500 text-white' 
                      : 'bg-white border border-gray-100'
                  }`}>
                    <p className={`text-xs font-medium ${isTomorrow ? 'text-orange-100' : 'text-gray-500'}`}>
                      {DAY_SHORT[d]}
                    </p>
                    <p className={`text-xl font-bold ${isTomorrow ? '' : 'text-gray-900'}`}>
                      {totalNeeded}
                    </p>
                    <p className={`text-xs ${isTomorrow ? 'text-orange-100' : 'text-gray-400'}`}>
                      portions
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ TAB: STOCK ACTUEL ═══════════════ */}
      {activeTab === 'defrost' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Stock disponible (non expiré)</h2>
            <button
              onClick={() => {
                setDefrostItemId(stockItems[0]?.id || '')
                setShowDefrostModal(true)
              }}
              className="bg-orange-500 text-white font-semibold px-5 py-2 rounded-xl hover:bg-orange-600"
            >
              + Nouvelle sortie
            </button>
          </div>

          {defrostLogs.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
              <span className="text-5xl block mb-4">📦</span>
              <p className="text-gray-500">Aucun stock enregistré</p>
              <p className="text-gray-400 text-sm mt-2">Utilisez le bouton ci-dessus pour enregistrer une décongélation ou réception</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {defrostLogs.map(log => {
                const item = stockItems.find(i => i.id === log.stock_item_id)
                const expires = new Date(log.expires_at)
                const hoursLeft = Math.round((expires.getTime() - Date.now()) / 3600000)
                const isUrgent = hoursLeft < 24

                return (
                  <div key={log.id} className={`bg-white rounded-2xl p-5 border ${isUrgent ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${
                          item?.stock_type === 'fresh' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {log.quantity}
                        </div>
                        <div>
                          <h3 className="font-bold">{item?.name || 'Inconnu'}</h3>
                          <p className="text-sm text-gray-500">
                            Sorti le {new Date(log.defrosted_at).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {log.notes && <span className="ml-2 text-gray-400">— {log.notes}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`text-right ${isUrgent ? 'text-red-600' : 'text-gray-500'}`}>
                          <p className="font-semibold">
                            {isUrgent ? '⚠️ ' : ''}Expire {expires.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </p>
                          <p className="text-sm">{hoursLeft}h restantes</p>
                        </div>
                        <button
                          onClick={() => deleteLog(log.id)}
                          className="p-2 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ TAB: CONFIG / MOYENNES ═══════════════ */}
      {activeTab === 'config' && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Moyennes par jour (dernières {weeksBack} semaines)</h2>
          <p className="text-gray-500 mb-6">Consommation moyenne en portions par jour de la semaine, calculée automatiquement à partir des ventes.</p>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 sticky left-0 bg-gray-50">Article</th>
                  <th className="text-center px-3 py-3 font-semibold text-gray-600">Type</th>
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <th key={d} className={`text-center px-3 py-3 font-semibold ${
                      d === isoDay(tomorrow) ? 'text-orange-600 bg-orange-50' : 'text-gray-600'
                    }`}>
                      {DAY_SHORT[d]}
                    </th>
                  ))}
                  <th className="text-center px-3 py-3 font-semibold text-gray-600">Total/sem</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p, i) => {
                  const weekTotal = [1, 2, 3, 4, 5, 6, 7].reduce((s, d) => s + (p.avgPerDay[d] || 0), 0)
                  return (
                    <tr key={p.item.id} className={`border-b ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                      <td className="px-5 py-3 font-medium sticky left-0 bg-inherit">{p.item.name}</td>
                      <td className="text-center px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          p.item.stock_type === 'fresh' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {p.item.stock_type === 'fresh' ? 'Frais' : 'Surgelé'}
                        </span>
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7].map(d => {
                        const val = p.avgPerDay[d] || 0
                        return (
                          <td key={d} className={`text-center px-3 py-3 ${
                            d === isoDay(tomorrow) ? 'bg-orange-50 font-semibold' : ''
                          } ${val === 0 ? 'text-gray-300' : val >= 5 ? 'text-red-600 font-semibold' : ''}`}>
                            {val > 0 ? val.toFixed(1) : '—'}
                          </td>
                        )
                      })}
                      <td className="text-center px-3 py-3 font-semibold">{weekTotal.toFixed(1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: ENREGISTRER SORTIE ═══════════════ */}
      {showDefrostModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold">📦 Enregistrer une sortie</h2>
              <p className="text-gray-500 text-sm mt-1">Décongélation ce soir ou réception de frais pour demain</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Article</label>
                <select
                  value={defrostItemId}
                  onChange={e => setDefrostItemId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200"
                >
                  <optgroup label="🥩 Frais">
                    {stockItems.filter(i => i.stock_type === 'fresh').map(i => (
                      <option key={i.id} value={i.id}>{i.name} (DLC {i.dlc_days}j)</option>
                    ))}
                  </optgroup>
                  <optgroup label="🧊 Surgelés">
                    {stockItems.filter(i => i.stock_type === 'frozen').map(i => (
                      <option key={i.id} value={i.id}>{i.name} (DLC {i.dlc_days}j)</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Quick pack buttons for fresh items */}
              {(() => {
                const selected = stockItems.find(i => i.id === defrostItemId)
                if (selected?.pack_weight_g && selected?.portion_weight_g) {
                  const ppp = Math.floor(selected.pack_weight_g / selected.portion_weight_g)
                  return (
                    <div>
                      <label className="block text-sm font-medium mb-2">Raccourcis pack</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setDefrostQty(n * ppp)}
                            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                              defrostQty === n * ppp
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            {n} pack{n > 1 ? 's' : ''} ({n * ppp})
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                }
                return null
              })()}

              <div>
                <label className="block text-sm font-medium mb-2">Quantité (portions)</label>
                <input
                  type="number"
                  min={1}
                  value={defrostQty}
                  onChange={e => setDefrostQty(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Notes (optionnel)</label>
                <input
                  type="text"
                  value={defrostNotes}
                  onChange={e => setDefrostNotes(e.target.value)}
                  placeholder="ex: Pack entamé, commande fournisseur #123..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200"
                />
              </div>

              {/* Preview */}
              {(() => {
                const selected = stockItems.find(i => i.id === defrostItemId)
                if (selected) {
                  const tomorrowPreview = addDays(new Date(), 1)
                  const expiresPreview = addDays(tomorrowPreview, selected.dlc_days - 1)
                  return (
                    <div className="bg-gray-50 rounded-xl p-4 text-sm">
                      <p className="text-gray-600">
                        <strong>{defrostQty}</strong> portions de <strong>{selected.name}</strong>
                      </p>
                      <p className="text-gray-500">
                        Disponible dès demain — expire le <strong>{expiresPreview.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
                      </p>
                    </div>
                  )
                }
                return null
              })()}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowDefrostModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
                >
                  Annuler
                </button>
                <button
                  onClick={saveDefrost}
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? '...' : '💾 Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
