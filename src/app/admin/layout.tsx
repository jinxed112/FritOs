'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EstablishmentSwitcher } from '@/components/admin/EstablishmentSwitcher'
import { EstablishmentSelectModal } from '@/components/admin/EstablishmentSelectModal'
import { useEstablishmentContext } from '@/lib/establishment/client'

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
  { name: 'Livraisons', href: '/admin/deliveries', icon: '📦' },
  { name: 'Créneaux', href: '/admin/slots', icon: '⏰' },
  { name: 'Devices', href: '/admin/devices', icon: '📱' },
  { name: 'Stock', href: '/admin/stock-planning', icon: '📦' },
  { name: 'Rapports', href: '/admin/reports', icon: '📈' },
  { name: 'Paramètres', href: '/admin/settings', icon: '⚙️' },
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user: establishmentUser } = useEstablishmentContext()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
  }, [])

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    // Clear the establishment cookie too — otherwise the next user lands with
    // a stale selection. Best-effort, ignore network errors.
    try {
      await fetch('/api/admin/select-establishment', { method: 'DELETE' })
    } catch {}
    router.push('/admin/login')
    router.refresh()
  }

  // Don't show layout on login page
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  // Find current page name for mobile header
  const currentPage = navigation.find(
    n => pathname === n.href || (n.href !== '/admin' && pathname.startsWith(n.href))
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      {/* Mobile top bar */}
      <div className="lg:hidden bg-gray-900 text-white flex items-center justify-between px-4 py-3 sticky top-0 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg">🍟</span>
          <span className="font-bold text-orange-500">FritOS</span>
          {currentPage && <span className="text-gray-400 text-sm">— {currentPage.name}</span>}
        </div>
        <div className="w-10" /> {/* Spacer for centering */}
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0 lg:flex-shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="text-3xl">🍟</span>
            <div>
              <h1 className="text-xl font-bold text-orange-500">FritOS</h1>
              <p className="text-xs text-gray-400">Back-office</p>
            </div>
          </Link>
          {/* Close button (mobile only) */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <EstablishmentSwitcher />

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
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center font-bold">
              {user?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.email || 'Admin'}</p>
              <p className="text-xs text-gray-400 capitalize">
                {establishmentUser?.role
                  ? establishmentUser.role.replace('_', ' ')
                  : 'Admin'}
              </p>
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
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>

      <EstablishmentSelectModal />
    </div>
  )
}