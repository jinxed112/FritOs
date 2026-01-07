import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-white mb-4">FritOS</h1>
          <p className="text-xl text-white/80">Système de caisse MDjambo</p>
        </div>

        {/* Navigation cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Admin */}
          <Link href="/admin" className="bg-white rounded-2xl p-6 shadow-lg hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">⚙️</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Back-office</h2>
            <p className="text-gray-500">Gestion produits, rapports, paramètres</p>
          </Link>

          {/* Devices - NOUVEAU */}
          <Link href="/device" className="bg-white rounded-2xl p-6 shadow-lg hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">📱</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Devices</h2>
            <p className="text-gray-500">Bornes, écrans cuisine, caisses</p>
          </Link>

          {/* Click & Collect */}
          <Link href="/order/boussu" className="bg-white rounded-2xl p-6 shadow-lg hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">🛒</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Click & Collect</h2>
            <p className="text-gray-500">Commandes en ligne</p>
          </Link>

          {/* Driver */}
          <Link href="/driver" className="bg-white rounded-2xl p-6 shadow-lg hover:scale-105 transition-transform">
            <div className="text-4xl mb-4">🛵</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Livreur</h2>
            <p className="text-gray-500">Application livreur</p>
          </Link>
        </div>

        {/* Status */}
        <div className="mt-8 flex justify-center">
          <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-bold text-green-700">Système OK</p>
              <p className="text-green-600 text-sm">Connecté à Supabase</p>
            </div>
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
