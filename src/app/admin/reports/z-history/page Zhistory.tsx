'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, endOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'

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
  source_breakdown: any[]
  top_products: any[]
  closed_at: string
  closed_by: string | null
}

export default function ZReportsHistoryPage() {
  const [reports, setReports] = useState<ZReport[]>([])
  const [loading, setLoading] = useState(true)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeDate, setCloseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedReport, setSelectedReport] = useState<ZReport | null>(null)
  const [establishment, setEstablishment] = useState<any>(null)

  const supabase = createClient()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadReports()
    loadEstablishment()
  }, [])

  async function loadEstablishment() {
    const { data } = await supabase
      .from('establishments')
      .select('name, address, phone, vat_number')
      .eq('id', establishmentId)
      .single()
    
    setEstablishment(data)
  }

  async function loadReports() {
    setLoading(true)
    
    try {
      const response = await fetch(`/api/reports/z-report?establishmentId=${establishmentId}&limit=50`)
      const data = await response.json()
      
      if (data.reports) {
        setReports(data.reports)
      }
    } catch (error) {
      console.error('Erreur chargement rapports:', error)
    }
    
    setLoading(false)
  }

  async function closeDay() {
    setClosing(true)
    
    const periodStart = startOfDay(new Date(closeDate)).toISOString()
    const periodEnd = endOfDay(new Date(closeDate)).toISOString()
    
    try {
      const response = await fetch('/api/reports/z-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId,
          periodStart,
          periodEnd,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert(`✅ ${data.message}`)
        setShowCloseModal(false)
        loadReports()
      } else {
        alert(`❌ Erreur: ${data.error}`)
      }
    } catch (error: any) {
      alert(`❌ Erreur: ${error.message}`)
    }
    
    setClosing(false)
  }

  function printReport(report: ZReport) {
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (!printWindow) return
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapport Z n°${report.report_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            width: 80mm;
            padding: 5mm;
            font-size: 10pt;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .big { font-size: 14pt; }
          .small { font-size: 8pt; }
          .line { border-top: 1px dashed #000; margin: 3mm 0; }
          .double-line { border-top: 2px solid #000; margin: 3mm 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 1mm 0; }
          .right { text-align: right; }
          .section { margin: 3mm 0; }
          .total-box { 
            border: 2px solid #000; 
            padding: 3mm; 
            margin: 3mm 0;
            text-align: center;
          }
          @media print {
            body { width: 80mm; }
            @page { size: 80mm auto; margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold big">${establishment?.name || 'MDjambo'}</div>
          <div class="small">${establishment?.address || ''}</div>
          <div class="small">${establishment?.phone || ''}</div>
          <div class="small">TVA: ${establishment?.vat_number || ''}</div>
        </div>
        
        <div class="line"></div>
        
        <div class="center">
          <div class="bold big">RAPPORT Z</div>
          <div class="bold">N° ${String(report.report_number).padStart(6, '0')}</div>
        </div>
        
        <div class="line"></div>
        
        <div class="section">
          <table>
            <tr>
              <td>Du:</td>
              <td class="right">${format(new Date(report.period_start), 'dd/MM/yyyy HH:mm')}</td>
            </tr>
            <tr>
              <td>Au:</td>
              <td class="right">${format(new Date(report.period_end), 'dd/MM/yyyy HH:mm')}</td>
            </tr>
            <tr>
              <td>Clôturé le:</td>
              <td class="right">${format(new Date(report.closed_at), 'dd/MM/yyyy HH:mm')}</td>
            </tr>
          </table>
        </div>
        
        <div class="line"></div>
        
        <div class="section">
          <div class="bold">RÉSUMÉ</div>
          <table>
            <tr>
              <td>Nombre de tickets:</td>
              <td class="right bold">${report.orders_count}</td>
            </tr>
            <tr>
              <td>Panier moyen:</td>
              <td class="right">${report.orders_count > 0 ? (report.total_ttc / report.orders_count).toFixed(2) : '0.00'}€</td>
            </tr>
          </table>
        </div>
        
        <div class="line"></div>
        
        <div class="section">
          <div class="bold">VENTILATION TVA</div>
          ${report.vat_breakdown.map(v => `
            <table>
              <tr>
                <td>TVA ${v.rate}%</td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td class="small">  Base HT:</td>
                <td class="right">${v.base_ht.toFixed(2)}€</td>
              </tr>
              <tr>
                <td class="small">  TVA:</td>
                <td class="right">${v.tva_amount.toFixed(2)}€</td>
              </tr>
            </table>
          `).join('')}
          <div class="line"></div>
          <table>
            <tr class="bold">
              <td>Total HT:</td>
              <td class="right">${report.total_ht.toFixed(2)}€</td>
            </tr>
            <tr class="bold">
              <td>Total TVA:</td>
              <td class="right">${report.total_tva.toFixed(2)}€</td>
            </tr>
          </table>
        </div>
        
        <div class="line"></div>
        
        <div class="section">
          <div class="bold">PAR MODE</div>
          <table>
            <tr>
              <td>Sur place (${report.eat_in_count}):</td>
              <td class="right">${report.eat_in_total.toFixed(2)}€</td>
            </tr>
            <tr>
              <td>Emporter (${report.takeaway_count}):</td>
              <td class="right">${report.takeaway_total.toFixed(2)}€</td>
            </tr>
          </table>
        </div>
        
        <div class="line"></div>
        
        <div class="section">
          <div class="bold">PAR PAIEMENT</div>
          <table>
            <tr>
              <td>Espèces (${report.cash_count}):</td>
              <td class="right">${report.cash_total.toFixed(2)}€</td>
            </tr>
            <tr>
              <td>Carte (${report.card_count}):</td>
              <td class="right">${report.card_total.toFixed(2)}€</td>
            </tr>
          </table>
        </div>
        
        <div class="double-line"></div>
        
        <div class="total-box">
          <div class="small">CHIFFRE D'AFFAIRES TTC</div>
          <div class="bold big">${report.total_ttc.toFixed(2)} €</div>
        </div>
        
        <div class="line"></div>
        
        <div class="section">
          <div class="bold small">TOP 5 PRODUITS</div>
          ${report.top_products.slice(0, 5).map((p, i) => `
            <div class="small">${i + 1}. ${p.product_name} x${p.quantity} = ${p.total.toFixed(2)}€</div>
          `).join('')}
        </div>
        
        <div class="line"></div>
        
        <div class="center small">
          <div>Document officiel</div>
          <div>Conservez ce ticket</div>
          <div>FritOS v1.0</div>
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📋 Rapports Z - Historique</h1>
          <p className="text-gray-500">{reports.length} clôture(s) enregistrée(s)</p>
        </div>
        
        <button
          onClick={() => setShowCloseModal(true)}
          className="bg-red-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-red-600 flex items-center gap-2"
        >
          🔒 Clôturer une journée
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-blue-800">
          <strong>ℹ️ Rapport Z :</strong> Document fiscal officiel attestant des ventes de la journée. 
          Une fois clôturé, le rapport est définitif et numéroté séquentiellement.
        </p>
      </div>

      {/* Liste des rapports */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
          Chargement...
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">📋</span>
          <p className="text-gray-500 mb-4">Aucune clôture effectuée</p>
          <button
            onClick={() => setShowCloseModal(true)}
            className="text-orange-500 font-medium hover:underline"
          >
            Effectuer votre première clôture
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(report => (
            <div
              key={report.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-orange-100 text-orange-600 w-16 h-16 rounded-xl flex items-center justify-center">
                      <span className="text-2xl font-bold">Z</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">
                        Rapport Z n°{String(report.report_number).padStart(6, '0')}
                      </h3>
                      <p className="text-gray-500">
                        {format(new Date(report.period_start), 'EEEE d MMMM yyyy', { locale: fr })}
                      </p>
                      <p className="text-sm text-gray-400">
                        Clôturé le {format(new Date(report.closed_at), 'dd/MM/yyyy à HH:mm', { locale: fr })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-3xl font-bold text-orange-500">{report.total_ttc.toFixed(2)} €</p>
                    <p className="text-gray-500">{report.orders_count} commande(s)</p>
                  </div>
                </div>
                
                {/* Détails rapides */}
                <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
                  <div className="text-center">
                    <p className="text-sm text-gray-500">🍽️ Sur place</p>
                    <p className="font-bold">{report.eat_in_total.toFixed(2)} €</p>
                    <p className="text-xs text-gray-400">{report.eat_in_count} cmd</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500">🥡 Emporter</p>
                    <p className="font-bold">{report.takeaway_total.toFixed(2)} €</p>
                    <p className="text-xs text-gray-400">{report.takeaway_count} cmd</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500">💵 Espèces</p>
                    <p className="font-bold">{report.cash_total.toFixed(2)} €</p>
                    <p className="text-xs text-gray-400">{report.cash_count} tr.</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500">💳 Carte</p>
                    <p className="font-bold">{report.card_total.toFixed(2)} €</p>
                    <p className="text-xs text-gray-400">{report.card_count} tr.</p>
                  </div>
                </div>
                
                {/* TVA */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">TVA:</span>
                    {report.vat_breakdown.map((v: any) => (
                      <span key={v.rate} className="bg-gray-100 px-3 py-1 rounded-full text-sm">
                        {v.rate}%: {v.tva_amount.toFixed(2)} €
                      </span>
                    ))}
                    <span className="font-bold ml-auto">
                      Total TVA: {report.total_tva.toFixed(2)} €
                    </span>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setSelectedReport(report)}
                    className="flex-1 bg-gray-100 text-gray-700 font-medium py-2 rounded-lg hover:bg-gray-200"
                  >
                    👁️ Voir détails
                  </button>
                  <button
                    onClick={() => printReport(report)}
                    className="flex-1 bg-orange-100 text-orange-700 font-medium py-2 rounded-lg hover:bg-orange-200"
                  >
                    🖨️ Imprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Clôture */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-2">🔒 Clôturer une journée</h2>
            <p className="text-gray-500 mb-6">
              Cette action créera un rapport Z définitif et numéroté.
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date à clôturer
              </label>
              <input
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
              <p className="text-yellow-800 text-sm">
                ⚠️ <strong>Attention :</strong> Une fois clôturé, le rapport Z ne peut plus être modifié. 
                Assurez-vous que toutes les commandes du jour sont enregistrées.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-semibold"
              >
                Annuler
              </button>
              <button
                onClick={closeDay}
                disabled={closing}
                className="flex-1 px-6 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50"
              >
                {closing ? '⏳ Clôture...' : '🔒 Clôturer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détails */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Rapport Z n°{String(selectedReport.report_number).padStart(6, '0')}
                </h2>
                <p className="text-gray-500">
                  {format(new Date(selectedReport.period_start), 'EEEE d MMMM yyyy', { locale: fr })}
                </p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Totaux */}
              <div className="bg-orange-50 rounded-xl p-6 text-center">
                <p className="text-gray-600 mb-2">Chiffre d'affaires TTC</p>
                <p className="text-5xl font-bold text-orange-500">{selectedReport.total_ttc.toFixed(2)} €</p>
                <p className="text-gray-500 mt-2">{selectedReport.orders_count} commande(s)</p>
              </div>
              
              {/* Ventilation TVA */}
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
                    {selectedReport.vat_breakdown.map((v: any) => (
                      <tr key={v.rate} className="border-b">
                        <td className="p-3 font-medium">{v.rate}%</td>
                        <td className="p-3 text-right">{v.base_ht.toFixed(2)} €</td>
                        <td className="p-3 text-right">{v.tva_amount.toFixed(2)} €</td>
                        <td className="p-3 text-right font-bold">{v.total_ttc.toFixed(2)} €</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td className="p-3">TOTAL</td>
                      <td className="p-3 text-right">{selectedReport.total_ht.toFixed(2)} €</td>
                      <td className="p-3 text-right">{selectedReport.total_tva.toFixed(2)} €</td>
                      <td className="p-3 text-right text-orange-500">{selectedReport.total_ttc.toFixed(2)} €</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* Top produits */}
              <div>
                <h3 className="font-bold text-lg mb-3">🏆 Top 10 produits</h3>
                <div className="space-y-2">
                  {selectedReport.top_products.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                      <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                        {i + 1}
                      </span>
                      <span className="flex-1">{p.product_name}</span>
                      <span className="text-gray-500">x{p.quantity}</span>
                      <span className="font-bold">{p.total.toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Métadonnées */}
              <div className="text-sm text-gray-500 pt-4 border-t">
                <p>Période: {format(new Date(selectedReport.period_start), 'dd/MM/yyyy HH:mm')} - {format(new Date(selectedReport.period_end), 'dd/MM/yyyy HH:mm')}</p>
                <p>Clôturé le: {format(new Date(selectedReport.closed_at), 'dd/MM/yyyy à HH:mm:ss')}</p>
                <p>ID: {selectedReport.id}</p>
              </div>
            </div>
            
            <div className="sticky bottom-0 bg-white p-6 border-t border-gray-100">
              <button
                onClick={() => printReport(selectedReport)}
                className="w-full bg-orange-500 text-white font-semibold py-3 rounded-xl hover:bg-orange-600"
              >
                🖨️ Imprimer ce rapport
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
