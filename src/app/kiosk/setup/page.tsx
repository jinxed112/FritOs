'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
  const [error, setError] = useState<string | null>(null)
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [accessCode, setAccessCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  
  const router = useRouter()

  // Vérifier si déjà authentifié au chargement
  useEffect(() => {
    checkAuthentication()
  }, [])

  async function checkAuthentication() {
    try {
      const response = await fetch('/api/devices/list?deviceType=kiosk')
      const data = await response.json()
      
      if (data.authenticated) {
        setIsAuthenticated(true)
        setDevices(data.devices || [])
      }
    } catch (err) {
      // Non authentifié, afficher le formulaire
    } finally {
      setCheckingAuth(false)
      setLoading(false)
    }
  }

  async function submitAccessCode() {
    if (!accessCode.trim()) {
      setAuthError('Entrez le code d\'accès')
      return
    }
    
    setAuthError('')
    setLoading(true)
    
    try {
      const response = await fetch('/api/devices/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: accessCode.trim().toUpperCase() })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setIsAuthenticated(true)
        // Recharger les devices
        loadDevices()
      } else {
        setAuthError(data.error || 'Code incorrect')
        setLoading(false)
      }
    } catch (err) {
      setAuthError('Erreur de connexion')
      setLoading(false)
    }
  }

  async function loadDevices() {
    try {
      const response = await fetch('/api/devices/list?deviceType=kiosk')
      const data = await response.json()
      
      if (data.error && !data.authenticated) {
        setIsAuthenticated(false)
        setError(data.error)
      } else {
        setDevices(data.devices || [])
      }
    } catch (err) {
      console.error('Error loading devices:', err)
      setError('Erreur de chargement des bornes')
    } finally {
      setLoading(false)
    }
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

  // Écran de chargement initial
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <span className="text-6xl block mb-4">🖥️</span>
          <p className="text-xl">Vérification...</p>
        </div>
      </div>
    )
  }

  // Écran de code d'accès
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
          <div className="text-center mb-8">
            <span className="text-6xl block mb-4">🔐</span>
            <h1 className="text-2xl font-bold text-gray-900">Accès Configuration</h1>
            <p className="text-gray-500">Entrez le code d'accès pour voir les bornes</p>
          </div>
          
          <div className="space-y-4">
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && submitAccessCode()}
              placeholder="CODE D'ACCÈS"
              className="w-full text-center text-2xl font-mono tracking-widest border-2 border-gray-200 rounded-xl p-4 focus:border-orange-500 focus:outline-none uppercase"
              autoFocus
            />
            
            {authError && (
              <p className="text-red-500 text-center text-sm">{authError}</p>
            )}
            
            <button
              onClick={submitAccessCode}
              disabled={loading}
              className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {loading ? 'Vérification...' : 'Valider'}
            </button>
          </div>
          
          <div className="mt-8 p-4 bg-gray-50 rounded-xl">
            <p className="text-gray-500 text-sm text-center">
              💡 Le code d'accès est défini par l'administrateur.<br />
              Contactez votre responsable si vous ne le connaissez pas.
            </p>
          </div>
          
          <p className="text-center text-xs text-gray-400 mt-6">
            Accès direct : /kiosk/CODE (nécessite le PIN du device)
          </p>
        </div>
      </div>
    )
  }

  // Écran de chargement des devices
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

  // Liste des bornes (authentifié)
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center p-8">
      <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl">
        <div className="text-center mb-8">
          <span className="text-6xl block mb-4">🖥️</span>
          <h1 className="text-2xl font-bold text-gray-900">Bornes disponibles</h1>
          <p className="text-gray-500">Sélectionnez une borne ou copiez son URL</p>
        </div>
        
        {error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">⚠️ {error}</p>
            <button 
              onClick={() => { setError(null); setLoading(true); loadDevices(); }}
              className="text-orange-500 underline"
            >
              Réessayer
            </button>
          </div>
        ) : devices.length === 0 ? (
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
                      <span className="text-green-500 text-sm">💳 Viva ✔</span>
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