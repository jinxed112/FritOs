'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Device = {
  id: string
  device_code: string
  name: string
  viva_terminal_id: string | null
}

export default function KioskSetupPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  const supabase = createClient()
  const router = useRouter()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadDevices()
  }, [])

  async function loadDevices() {
    const { data, error } = await supabase
      .from('devices')
      .select('id, device_code, name, viva_terminal_id')
      .eq('establishment_id', establishmentId)
      .eq('device_type', 'kiosk')
      .eq('is_active', true)
      .order('device_code')
    
    if (!error) {
      setDevices(data || [])
    }
    
    setLoading(false)
  }

  function goToDevice(deviceCode: string) {
    router.push(`/kiosk/${deviceCode}`)
  }

  async function copyUrl(deviceCode: string) {
    const url = `${window.location.origin}/kiosk/${deviceCode}`
    await navigator.clipboard.writeText(url)
    setCopiedCode(deviceCode)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <span className="text-6xl block mb-4">🖥️</span>
          <p className="text-xl">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center p-8">
      <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl">
        <div className="text-center mb-8">
          <span className="text-6xl block mb-4">🖥️</span>
          <h1 className="text-2xl font-bold text-gray-900">Bornes disponibles</h1>
          <p className="text-gray-500">Sélectionnez une borne ou copiez son URL</p>
        </div>
        
        {devices.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">Aucune borne configurée</p>
            <p className="text-sm text-gray-400">
              Créez d'abord un device de type "Borne" dans<br />
              Admin → Devices
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map(device => (
              <div
                key={device.id}
                className="border-2 border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-bold text-lg">{device.name}</p>
                    <p className="text-sm text-gray-500 font-mono">{device.device_code}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {device.viva_terminal_id ? (
                      <span className="text-green-500 text-sm">💳 Viva ✓</span>
                    ) : (
                      <span className="text-yellow-500 text-sm">⚠️ Pas de terminal</span>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => goToDevice(device.device_code)}
                    className="flex-1 bg-orange-500 text-white font-semibold py-2 rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Ouvrir →
                  </button>
                  <button
                    onClick={() => copyUrl(device.device_code)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                      copiedCode === device.device_code
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {copiedCode === device.device_code ? '✓ Copié' : '📋 URL'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-8 p-4 bg-blue-50 rounded-xl">
          <h3 className="font-bold text-blue-800 mb-2">💡 Comment configurer une borne</h3>
          <ol className="text-blue-700 text-sm space-y-1 list-decimal list-inside">
            <li>Créez un raccourci bureau vers l'URL de la borne</li>
            <li>Au premier lancement, entrez le PIN (visible dans Admin → Devices)</li>
            <li>La borne restera connectée automatiquement</li>
          </ol>
        </div>
        
        <p className="text-center text-xs text-gray-400 mt-6">
          URL format : /kiosk/CODE (ex: /kiosk/BORJU01)
        </p>
      </div>
    </div>
  )
}
