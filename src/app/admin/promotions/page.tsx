'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type PromoCode = {
  id: string
  code: string
  description: string | null
  discount_type: string
  discount_value: number
  minimum_purchase: number | null
  start_date: string | null
  end_date: string | null
  usage_limit: number | null
  usage_count: number
  is_active: boolean
  created_at: string
}

type Promotion = {
  id: string
  name: string
  description: string | null
  promo_type: string
  discount_value: number
  minimum_purchase: number | null
  valid_eat_in: boolean
  valid_takeaway: boolean
  start_date: string | null
  end_date: string | null
  is_active: boolean
  is_combinable: boolean
  usage_count: number
  created_at: string
}

type ActiveTab = 'codes' | 'promos'

export default function PromotionsPage() {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('codes')
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [showPromoModal, setShowPromoModal] = useState(false)
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null)
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null)
  
  const [codeForm, setCodeForm] = useState({
    code: '', description: '', discount_type: 'percentage', discount_value: 10,
    minimum_purchase: 0, start_date: '', end_date: '', usage_limit: 0, is_active: true,
  })
  
  const [promoForm, setPromoForm] = useState({
    name: '', description: '', promo_type: 'percentage', discount_value: 10,
    minimum_purchase: 0, start_date: '', end_date: '', valid_eat_in: true,
    valid_takeaway: true, is_active: true, is_combinable: false,
  })
  
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: codes }, { data: promos }] = await Promise.all([
      supabase.from('promo_codes').select('*').eq('establishment_id', establishmentId).order('created_at', { ascending: false }),
      supabase.from('promotions').select('*').eq('establishment_id', establishmentId).order('created_at', { ascending: false }),
    ])
    setPromoCodes(codes || [])
    setPromotions(promos || [])
    setLoading(false)
  }

  function generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  function openCodeModal(code?: PromoCode) {
    setEditingCode(code || null)
    setCodeForm(code ? {
      code: code.code, description: code.description || '', discount_type: code.discount_type,
      discount_value: code.discount_value, minimum_purchase: code.minimum_purchase || 0,
      start_date: code.start_date?.split('T')[0] || '', end_date: code.end_date?.split('T')[0] || '',
      usage_limit: code.usage_limit || 0, is_active: code.is_active,
    } : {
      code: generateCode(), description: '', discount_type: 'percentage', discount_value: 10,
      minimum_purchase: 0, start_date: '', end_date: '', usage_limit: 0, is_active: true,
    })
    setFormError('')
    setShowCodeModal(true)
  }

  async function saveCode(e: React.FormEvent) {
    e.preventDefault()
    if (!codeForm.code.trim()) { setFormError('Code obligatoire'); return }
    setSaving(true)
    try {
      const data = {
        code: codeForm.code.toUpperCase(), description: codeForm.description || null,
        discount_type: codeForm.discount_type, discount_value: codeForm.discount_value,
        minimum_purchase: codeForm.minimum_purchase || null,
        start_date: codeForm.start_date || null, end_date: codeForm.end_date || null,
        usage_limit: codeForm.usage_limit || null, is_active: codeForm.is_active,
      }
      if (editingCode) {
        await supabase.from('promo_codes').update(data).eq('id', editingCode.id)
      } else {
        await supabase.from('promo_codes').insert({ ...data, establishment_id: establishmentId })
      }
      setShowCodeModal(false)
      loadData()
    } catch (err: any) { setFormError(err.message) }
    finally { setSaving(false) }
  }

  function openPromoModal(promo?: Promotion) {
    setEditingPromo(promo || null)
    setPromoForm(promo ? {
      name: promo.name, description: promo.description || '', promo_type: promo.promo_type,
      discount_value: promo.discount_value, minimum_purchase: promo.minimum_purchase || 0,
      start_date: promo.start_date || '', end_date: promo.end_date || '',
      valid_eat_in: promo.valid_eat_in, valid_takeaway: promo.valid_takeaway,
      is_active: promo.is_active, is_combinable: promo.is_combinable,
    } : {
      name: '', description: '', promo_type: 'percentage', discount_value: 10,
      minimum_purchase: 0, start_date: '', end_date: '', valid_eat_in: true,
      valid_takeaway: true, is_active: true, is_combinable: false,
    })
    setFormError('')
    setShowPromoModal(true)
  }

  async function savePromo(e: React.FormEvent) {
    e.preventDefault()
    if (!promoForm.name.trim()) { setFormError('Nom obligatoire'); return }
    setSaving(true)
    try {
      const data = {
        name: promoForm.name, description: promoForm.description || null,
        promo_type: promoForm.promo_type, discount_value: promoForm.discount_value,
        minimum_purchase: promoForm.minimum_purchase || null,
        start_date: promoForm.start_date || null, end_date: promoForm.end_date || null,
        valid_eat_in: promoForm.valid_eat_in, valid_takeaway: promoForm.valid_takeaway,
        is_active: promoForm.is_active, is_combinable: promoForm.is_combinable,
      }
      if (editingPromo) {
        await supabase.from('promotions').update(data).eq('id', editingPromo.id)
      } else {
        await supabase.from('promotions').insert({ ...data, establishment_id: establishmentId })
      }
      setShowPromoModal(false)
      loadData()
    } catch (err: any) { setFormError(err.message) }
    finally { setSaving(false) }
  }

  async function toggleCodeActive(c: PromoCode) {
    await supabase.from('promo_codes').update({ is_active: !c.is_active }).eq('id', c.id)
    loadData()
  }

  async function togglePromoActive(p: Promotion) {
    await supabase.from('promotions').update({ is_active: !p.is_active }).eq('id', p.id)
    loadData()
  }

  async function deleteCode(c: PromoCode) {
    if (confirm(`Supprimer "${c.code}" ?`)) {
      await supabase.from('promo_codes').delete().eq('id', c.id)
      loadData()
    }
  }

  async function deletePromo(p: Promotion) {
    if (confirm(`Supprimer "${p.name}" ?`)) {
      await supabase.from('promotions').delete().eq('id', p.id)
      loadData()
    }
  }

  function getCodeStatus(c: PromoCode) {
    if (!c.is_active) return { label: '🚫 Désactivé', color: 'bg-gray-100 text-gray-600' }
    const now = new Date()
    if (c.start_date && new Date(c.start_date) > now) return { label: '📅 Programmé', color: 'bg-blue-100 text-blue-600' }
    if (c.end_date && new Date(c.end_date) < now) return { label: '⏰ Expiré', color: 'bg-red-100 text-red-600' }
    if (c.usage_limit && c.usage_count >= c.usage_limit) return { label: '🔒 Épuisé', color: 'bg-orange-100 text-orange-600' }
    return { label: '✅ Actif', color: 'bg-green-100 text-green-600' }
  }

  function getDiscount(type: string, value: number) {
    return type === 'percentage' ? `${value}%` : type === 'fixed' ? `${value}€` : '🎁'
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Promotions</h1>
          <p className="text-gray-500">Codes promo et offres automatiques</p>
        </div>
        <button onClick={() => activeTab === 'codes' ? openCodeModal() : openPromoModal()}
          className="bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600">
          ➕ {activeTab === 'codes' ? 'Nouveau code' : 'Nouvelle promo'}
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab('codes')}
          className={`px-6 py-3 rounded-xl font-medium ${activeTab === 'codes' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
          🏷️ Codes Promo ({promoCodes.length})
        </button>
        <button onClick={() => setActiveTab('promos')}
          className={`px-6 py-3 rounded-xl font-medium ${activeTab === 'promos' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
          🎁 Promos Auto ({promotions.length})
        </button>
      </div>

      {loading ? <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div> :
      activeTab === 'codes' ? (
        promoCodes.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center">
            <span className="text-5xl block mb-4">🏷️</span>
            <p className="text-gray-500">Aucun code promo</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {promoCodes.map(c => {
              const status = getCodeStatus(c)
              return (
                <div key={c.id} className={`bg-white rounded-2xl p-6 border border-gray-100 ${!c.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-orange-100 text-orange-600 font-bold text-xl px-4 py-2 rounded-xl">
                        {getDiscount(c.discount_type, c.discount_value)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xl bg-gray-100 px-3 py-1 rounded">{c.code}</span>
                          <button onClick={() => navigator.clipboard.writeText(c.code)} className="text-gray-400 hover:text-gray-600">📋</button>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                        </div>
                        {c.description && <p className="text-gray-500 mt-1">{c.description}</p>}
                        <div className="text-sm text-gray-400 mt-1 flex gap-4">
                          {c.minimum_purchase && c.minimum_purchase > 0 && <span>Min: {c.minimum_purchase}€</span>}
                          {c.usage_limit && <span>Utilisations: {c.usage_count}/{c.usage_limit}</span>}
                          {c.end_date && <span>Expire: {new Date(c.end_date).toLocaleDateString('fr-BE')}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleCodeActive(c)}
                        className={`px-3 py-1 rounded-full text-sm font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.is_active ? 'Actif' : 'Inactif'}
                      </button>
                      <button onClick={() => openCodeModal(c)} className="p-2 hover:bg-gray-100 rounded-lg">✏️</button>
                      <button onClick={() => deleteCode(c)} className="p-2 hover:bg-red-100 rounded-lg">🗑️</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        promotions.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center">
            <span className="text-5xl block mb-4">🎁</span>
            <p className="text-gray-500">Aucune promotion</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {promotions.map(p => (
              <div key={p.id} className={`bg-white rounded-2xl p-6 border border-gray-100 ${!p.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-purple-100 text-purple-600 font-bold text-xl px-4 py-2 rounded-xl">
                      {getDiscount(p.promo_type, p.discount_value)}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{p.name}</h3>
                      {p.description && <p className="text-gray-500">{p.description}</p>}
                      <div className="text-sm text-gray-400 mt-1 flex gap-3">
                        {p.valid_eat_in && <span>🍽️ Sur place</span>}
                        {p.valid_takeaway && <span>🥡 Emporter</span>}
                        {p.is_combinable && <span>🔗 Combinable</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => togglePromoActive(p)}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? 'Actif' : 'Inactif'}
                    </button>
                    <button onClick={() => openPromoModal(p)} className="p-2 hover:bg-gray-100 rounded-lg">✏️</button>
                    <button onClick={() => deletePromo(p)} className="p-2 hover:bg-red-100 rounded-lg">🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Modal Code */}
      {showCodeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b"><h2 className="text-2xl font-bold">{editingCode ? 'Modifier' : 'Nouveau'} code promo</h2></div>
            <form onSubmit={saveCode} className="p-6 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 p-3 rounded-xl">{formError}</div>}
              <div>
                <label className="block text-sm font-medium mb-2">Code *</label>
                <div className="flex gap-2">
                  <input type="text" value={codeForm.code} onChange={e => setCodeForm({...codeForm, code: e.target.value.toUpperCase()})}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-mono uppercase" required />
                  <button type="button" onClick={() => setCodeForm({...codeForm, code: generateCode()})} className="px-4 py-3 bg-gray-100 rounded-xl">🎲</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <input type="text" value={codeForm.description} onChange={e => setCodeForm({...codeForm, description: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Type</label>
                  <select value={codeForm.discount_type} onChange={e => setCodeForm({...codeForm, discount_type: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200">
                    <option value="percentage">% Pourcentage</option>
                    <option value="fixed">€ Montant fixe</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Valeur</label>
                  <input type="number" value={codeForm.discount_value} onChange={e => setCodeForm({...codeForm, discount_value: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Date début</label>
                  <input type="date" value={codeForm.start_date} onChange={e => setCodeForm({...codeForm, start_date: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Date fin</label>
                  <input type="date" value={codeForm.end_date} onChange={e => setCodeForm({...codeForm, end_date: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={codeForm.is_active} onChange={e => setCodeForm({...codeForm, is_active: e.target.checked})} className="w-5 h-5 rounded" />
                <span>✅ Actif</span>
              </label>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCodeModal(false)} className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold">Annuler</button>
                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50">
                  {saving ? '...' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Promo */}
      {showPromoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b"><h2 className="text-2xl font-bold">{editingPromo ? 'Modifier' : 'Nouvelle'} promotion</h2></div>
            <form onSubmit={savePromo} className="p-6 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 p-3 rounded-xl">{formError}</div>}
              <div>
                <label className="block text-sm font-medium mb-2">Nom *</label>
                <input type="text" value={promoForm.name} onChange={e => setPromoForm({...promoForm, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Type</label>
                  <select value={promoForm.promo_type} onChange={e => setPromoForm({...promoForm, promo_type: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200">
                    <option value="percentage">% Pourcentage</option>
                    <option value="fixed">€ Montant fixe</option>
                    <option value="free_item">🎁 Article offert</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Valeur</label>
                  <input type="number" value={promoForm.discount_value} onChange={e => setPromoForm({...promoForm, discount_value: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={promoForm.valid_eat_in} onChange={e => setPromoForm({...promoForm, valid_eat_in: e.target.checked})} className="w-5 h-5 rounded" />
                  <span>🍽️ Sur place</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={promoForm.valid_takeaway} onChange={e => setPromoForm({...promoForm, valid_takeaway: e.target.checked})} className="w-5 h-5 rounded" />
                  <span>🥡 Emporter</span>
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={promoForm.is_active} onChange={e => setPromoForm({...promoForm, is_active: e.target.checked})} className="w-5 h-5 rounded" />
                  <span>✅ Active</span>
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowPromoModal(false)} className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold">Annuler</button>
                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50">
                  {saving ? '...' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
