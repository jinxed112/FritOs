'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Device = {
  id: string
  device_code: string
  name: string
  device_type: string
  viva_terminal_id: string | null
  establishment_id: string
  establishment?: { name: string }
}

export default function DeviceLoginPage() {
  const router = useRouter()
  const supabase = createClient()
  
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  
  // Login form
  const [email, setEmail] = useState('device@fritos.be')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  
  // Devices
  const [devices, setDevices] = useState<Device[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setIsLoggedIn(true)
        loadDevices()
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setCheckingAuth(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setLoginError('Email ou mot de passe incorrect')
      } else {
        setIsLoggedIn(true)
        loadDevices()
      }
    } catch (error) {
      setLoginError('Erreur de connexion')
    } finally {
      setLoginLoading(false)
    }
  }

  async function loadDevices() {
    setLoadingDevices(true)
    try {
      const { data, error } = await supabase
        .from('devices')
        .select(`
          id, device_code, name, device_type, viva_terminal_id, establishment_id,
          establishment:establishments ( name )
        `)
        .eq('is_active', true)
        .order('device_type')
        .order('device_code')

      if (!error && data) {
        setDevices(data as Device[])
      }
    } catch (error) {
      console.error('Load devices error:', error)
    } finally {
      setLoadingDevices(false)
    }
  }

  async function selectDevice(device: Device) {
    // Stocker le device sélectionné dans un cookie via API
    const response = await fetch('/api/device-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: device.id })
    })

    if (response.ok) {
      // Rediriger selon le type de device
      const routes: Record<string, string> = {
        'kiosk': `/kiosk/${device.device_code}`,
        'kds': '/kitchen',
        'counter': '/counter',
      }
      const route = routes[device.device_type] || '/device'
      router.push(route)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    await fetch('/api/device-auth', { method: 'DELETE' })
    setIsLoggedIn(false)
    setDevices([])
  }

  function getDeviceIcon(type: string): string {
    const icons: Record<string, string> = {
      'kiosk': '🖥️',
      'kds': '👨‍🍳',
      'counter': '💳',
    }
    return icons[type] || '📱'
  }

  function getDeviceTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'kiosk': 'Borne',
      'kds': 'Écran Cuisine',
      'counter': 'Caisse',
    }
    return labels[type] || type
  }

  function getDeviceColor(type: string): { border: string; bg: string; text: string } {
    const colors: Record<string, { border: string; bg: string; text: string }> = {
      'kiosk': { border: 'border-orange-400', bg: 'bg-orange-50', text: 'text-orange-600' },
      'kds': { border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-600' },
      'counter': { border: 'border-green-400', bg: 'bg-green-50', text: 'text-green-600' },
    }
    return colors[type] || { border: 'border-gray-400', bg: 'bg-gray-50', text: 'text-gray-600' }
  }

  const filteredDevices = filter ? devices.filter(d => d.device_type === filter) : devices
  const deviceTypes = [...new Set(devices.map(d => d.device_type))]

  // Loading
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <span className="text-6xl block mb-4 animate-pulse">🍟</span>
          <p className="text-xl">Chargement...</p>
        </div>
      </div>
    )
  }

  // Login form
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
          <div className="text-center mb-8">
            <span className="text-6xl block mb-4">🍟</span>
            <h1 className="text-2xl font-bold text-gray-900">FritOS - Devices</h1>
            <p className="text-gray-500">Connexion pour accéder aux appareils</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                placeholder="device@fritos.be"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                placeholder="••••••"
                required
              />
            </div>

            {loginError && (
              <p className="text-red-500 text-center text-sm">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loginLoading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-8 p-4 bg-gray-50 rounded-xl">
            <p className="text-gray-500 text-sm text-center">
              💡 Utilisez les identifiants fournis par l'administrateur
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Device selection
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="text-white">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <span className="text-4xl">🍟</span>
              FritOS - Devices
            </h1>
            <p className="text-gray-400 mt-1">Sélectionnez l'appareil à utiliser</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-700 text-gray-300 rounded-xl hover:bg-slate-600 transition-colors self-start"
          >
            🚪 Déconnexion
          </button>
        </div>

        {/* Filters */}
        {deviceTypes.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setFilter(null)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                filter === null
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              Tous ({devices.length})
            </button>
            {deviceTypes.map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                  filter === type
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {getDeviceIcon(type)} {getDeviceTypeLabel(type)} ({devices.filter(d => d.device_type === type).length})
              </button>
            ))}
          </div>
        )}

        {/* Devices grid */}
        {loadingDevices ? (
          <div className="text-center text-gray-400 py-12">
            <span className="text-5xl block mb-4 animate-pulse">📱</span>
            <p>Chargement des appareils...</p>
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <span className="text-5xl block mb-4">😕</span>
            <p className="text-lg">Aucun appareil configuré</p>
            <p className="text-sm mt-2">Créez des devices dans Admin → Devices</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDevices.map(device => {
              const colors = getDeviceColor(device.device_type)
              return (
                <button
                  key={device.id}
                  onClick={() => selectDevice(device)}
                  className={`p-6 rounded-2xl border-2 ${colors.border} ${colors.bg} text-left transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]`}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-4xl">{getDeviceIcon(device.device_type)}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate text-lg">{device.name}</h3>
                      <p className="text-gray-500 font-mono text-sm">{device.device_code}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
                          {getDeviceTypeLabel(device.device_type)}
                        </span>
                        {device.viva_terminal_id && (
                          <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                            💳 Viva
                          </span>
                        )}
                      </div>
                      {device.establishment && (
                        <p className="text-gray-400 text-xs mt-2">
                          📍 {(device.establishment as any).name}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Help */}
        <div className="mt-8 p-4 bg-slate-800 rounded-xl border border-slate-700">
          <h3 className="text-white font-semibold mb-2">💡 Comment ça marche ?</h3>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• Cliquez sur un appareil pour l'utiliser</li>
            <li>• <span className="text-orange-400">Bornes</span> : Interface client pour commandes</li>
            <li>• <span className="text-blue-400">Écrans Cuisine</span> : Affichage des commandes à préparer</li>
            <li>• <span className="text-green-400">Caisses</span> : Prise de commande employé</li>
          </ul>
        </div>
      </div>
    </div>
  )
}