'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: '📊' },
  { name: 'Commandes', href: '/admin/orders', icon: '🧾' },
  { name: 'Catégories', href: '/admin/categories', icon: '📁' },
  { name: 'Produits', href: '/admin/products', icon: '🍔' },
  { name: 'Propositions', href: '/admin/propositions', icon: '📋' },
  { name: 'Ingrédients', href: '/admin/ingredients', icon: '🥬' },
  { name: 'Fournisseurs', href: '/admin/suppliers', icon: '🚚' },
  { name: 'Promotions', href: '/admin/promotions', icon: '🎁' },
  { name: 'Clients', href: '/admin/customers', icon: '👥' },
  { name: 'Livreurs', href: '/admin/drivers', icon: '🛵' },
  { name: 'Devices', href: '/admin/devices', icon: '📱' },
  { name: 'Rapports', href: '/admin/reports', icon: '📈' },
]

const settingsNavigation = [
  { name: 'Établissements', href: '/admin/establishments', icon: '🏪' },
  { name: 'Général', href: '/admin/settings', icon: '⚙️' },
  { name: 'Créneaux', href: '/admin/settings/timeslots', icon: '🕐' },
  { name: 'Livraison', href: '/admin/settings/delivery', icon: '🚗' },
  { name: 'Fidélité', href: '/admin/settings/loyalty', icon: '⭐' },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
  }, [])

  // Ouvrir automatiquement les settings si on est sur une page settings
  useEffect(() => {
    if (pathname.startsWith('/admin/settings') || pathname === '/admin/establishments') {
      setShowSettings(true)
    }
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  // Don't show layout on login page
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="text-3xl">🍟</span>
            <div>
              <h1 className="text-xl font-bold text-orange-500">FritOS</h1>
              <p className="text-xs text-gray-400">MDjambo</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/admin' && pathname.startsWith(item.href))
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </Link>
            )
          })}

          {/* Separator */}
          <div className="border-t border-gray-700 my-4"></div>

          {/* Settings section */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">⚙️</span>
              <span className="font-medium">Paramètres</span>
            </div>
            <span className={`transition-transform ${showSettings ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showSettings && (
            <div className="ml-4 space-y-1">
              {settingsNavigation.map((item) => {
                const isActive = pathname === item.href
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                      isActive
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center font-bold">
              {user?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.email || 'Admin'}</p>
              <p className="text-xs text-gray-400">Super Admin</p>
            </div>
            <button 
              onClick={handleLogout}
              className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="Déconnexion"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
