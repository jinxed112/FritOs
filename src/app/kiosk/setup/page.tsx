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
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  
  const supabase = createClient()
  const router = useRouter()
  const establishmentId = 'a0000000-0000-0000-0000-000000000001'

  useEffect(() => {
    // Vérifier si déjà configuré
    const savedDevice = localStorage.getItem('kiosk_device_id')
    if (savedDevice) {
      router.push('/kiosk')
      return
    }
    
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

  function confirmSetup() {
    if (!selectedDevice) return
    
    localStorage.setItem('kiosk_device_id', selectedDevice)
    router.push('/kiosk')
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
      <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <span className="text-6xl block mb-4">🖥️</span>
          <h1 className="text-2xl font-bold text-gray-900">Configuration Borne</h1>
          <p className="text-gray-500">Sélectionnez l'identité de cette borne</p>
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
          <>
            <div className="space-y-3 mb-6">
              {devices.map(device => (
                <button
                  key={device.id}
                  onClick={() => setSelectedDevice(device.id)}
                  className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${
                    selectedDevice === device.id
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedDevice === device.id
                      ? 'border-orange-500 bg-orange-500'
                      : 'border-gray-300'
                  }`}>
                    {selectedDevice === device.id && (
                      <span className="text-white text-xs">✓</span>
                    )}
                  </div>
                  
                  <div className="flex-1 text-left">
                    <p className="font-bold">{device.name}</p>
                    <p className="text-sm text-gray-500">
                      {device.device_code}
                      {device.viva_terminal_id && (
                        <span className="ml-2 text-blue-500">💳 Viva configuré</span>
                      )}
                      {!device.viva_terminal_id && (
                        <span className="ml-2 text-yellow-500">⚠️ Pas de terminal</span>
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            
            <button
              onClick={confirmSetup}
              disabled={!selectedDevice}
              className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl text-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✓ Confirmer
            </button>
          </>
        )}
        
        <p className="text-center text-xs text-gray-400 mt-6">
          Cette configuration est stockée localement.<br />
          Pour changer, effacez les données du navigateur.
        </p>
      </div>
    </div>
  )
}
