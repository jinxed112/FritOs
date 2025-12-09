import Link from 'next/link'

export default function AdminDashboard() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Bienvenue sur FritOS - MDjambo Jurbise</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">🧾</span>
            <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
              +12%
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900">0</p>
          <p className="text-gray-500 text-sm">Commandes aujourd'hui</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">💰</span>
            <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
              +8%
            </span>
          </div>
          <p className="text-3xl font-bold text-orange-500">0 €</p>
          <p className="text-gray-500 text-sm">Chiffre d'affaires</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">🛒</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">0 €</p>
          <p className="text-gray-500 text-sm">Panier moyen</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">⏳</span>
          </div>
          <p className="text-3xl font-bold text-yellow-500">0</p>
          <p className="text-gray-500 text-sm">En préparation</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Actions rapides</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/admin/products/new"
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all text-center"
          >
            <span className="text-3xl block mb-2">➕</span>
            <span className="font-medium text-gray-700">Nouveau produit</span>
          </Link>
          
          <Link
            href="/admin/categories/new"
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all text-center"
          >
            <span className="text-3xl block mb-2">📁</span>
            <span className="font-medium text-gray-700">Nouvelle catégorie</span>
          </Link>
          
          <Link
            href="/admin/orders"
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all text-center"
          >
            <span className="text-3xl block mb-2">📋</span>
            <span className="font-medium text-gray-700">Voir commandes</span>
          </Link>
          
          <Link
            href="/admin/reports"
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all text-center"
          >
            <span className="text-3xl block mb-2">📊</span>
            <span className="font-medium text-gray-700">Rapport du jour</span>
          </Link>
        </div>
      </div>

      {/* Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-4">Dernières commandes</h3>
          <div className="text-center py-8 text-gray-400">
            <span className="text-4xl block mb-2">📭</span>
            <p>Aucune commande aujourd'hui</p>
          </div>
        </div>

        {/* System status */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-4">État du système</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Base de données</span>
              <span className="flex items-center gap-2 text-green-600">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Connecté
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Borne 1</span>
              <span className="flex items-center gap-2 text-gray-400">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                Non configuré
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">KDS Cuisine</span>
              <span className="flex items-center gap-2 text-gray-400">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                Non configuré
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Viva Wallet</span>
              <span className="flex items-center gap-2 text-gray-400">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                Non configuré
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
