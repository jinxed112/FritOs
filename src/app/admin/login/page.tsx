'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  
  const supabase = createClient()

  // Vérifier si déjà connecté au chargement
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsLoggedIn(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    // Vérifier le profil/rôle avant de rediriger
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    const allowedRoles = ['super_admin', 'admin', 'manager', 'employee']
    
    if (!profile || !allowedRoles.includes(profile.role)) {
      // Pas le bon rôle → déconnecter et afficher erreur
      await supabase.auth.signOut()
      setError('Accès non autorisé. Ce compte n\'a pas les droits d\'accès au back-office.')
      setLoading(false)
      return
    }

    // Tout est bon → rediriger
    window.location.href = '/admin'
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setError('')
    setEmail('')
    setPassword('')
    // Vider le cache pour être sûr
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-6xl">🍟</span>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">FritOS</h1>
          <p className="text-gray-500">Connexion au back-office</p>
        </div>

        {/* Déjà connecté → bouton déconnexion */}
        {isLoggedIn && !error && (
          <div className="text-center mb-6">
            <p className="text-gray-600 mb-4">Vous êtes déjà connecté.</p>
            <div className="flex gap-3">
              <a
                href="/admin"
                className="flex-1 bg-orange-500 text-white font-bold py-3 rounded-xl text-center hover:bg-orange-600 transition-colors"
              >
                Aller au back-office
              </a>
              <button
                onClick={handleLogout}
                className="flex-1 bg-gray-200 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-300 transition-colors"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
            <p>{error}</p>
            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="mt-2 text-sm underline text-red-600 hover:text-red-800"
              >
                Se déconnecter et réessayer
              </button>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="admin@mdjambo.be"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-400 text-sm mt-8">
          MDjambo © 2025
        </p>
      </div>
    </div>
  )
}