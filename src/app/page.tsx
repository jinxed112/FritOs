import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-white mb-4">FritOS</h1>
          <p className="text-xl text-white/80">Système de caisse MDjambo</p>
        </div>

        {/* Navigation cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Admin */}
          <Link href="/admin" className="card p-6 hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">⚙️</div>
            <h2 className="text-xl font-bold text-dark mb-2">Back-office</h2>
            <p className="text-gray-500">Gestion produits, rapports, paramètres</p>
          </Link>

          {/* Kiosk */}
          <Link href="/kiosk" className="card p-6 hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">📱</div>
            <h2 className="text-xl font-bold text-dark mb-2">Borne</h2>
            <p className="text-gray-500">Interface client pour commandes</p>
          </Link>

          {/* Kitchen */}
          <Link href="/kitchen" className="card p-6 hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">👨‍🍳</div>
            <h2 className="text-xl font-bold text-dark mb-2">Cuisine (KDS)</h2>
            <p className="text-gray-500">Affichage des commandes</p>
          </Link>

          {/* Counter */}
          <Link href="/counter" className="card p-6 hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">💳</div>
            <h2 className="text-xl font-bold text-dark mb-2">Caisse</h2>
            <p className="text-gray-500">Prise de commande employé</p>
          </Link>

          {/* Click & Collect */}
          <Link href="/order/jurbise" className="card p-6 hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">🛒</div>
            <h2 className="text-xl font-bold text-dark mb-2">Click & Collect</h2>
            <p className="text-gray-500">Commandes en ligne</p>
          </Link>

          {/* Status */}
          <div className="card p-6 bg-green-50 border-green-200">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-green-700 mb-2">Système OK</h2>
            <p className="text-green-600">Connecté à Supabase</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-white/60">
          <p>FritOS v1.0.0 • MDjambo © 2025</p>
        </div>
      </div>
    </main>
  )
}
