'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function ConfirmationPage() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const orderCode = searchParams.get('s') // Viva renvoie le orderCode dans 's'
  const transactionId = searchParams.get('t')

  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paymentStatus, setPaymentStatus] = useState<'checking' | 'paid' | 'failed'>('checking')

  useEffect(() => {
    if (orderId) {
      checkPaymentAndLoadOrder()
    } else if (orderCode) {
      // Attendre le webhook et chercher par orderCode
      findOrderByVivaCode()
    }
  }, [orderId, orderCode])

  async function checkPaymentAndLoadOrder() {
    try {
      // Vérifier le statut du paiement
      const paymentResponse = await fetch(`/api/payment/checkout?orderId=${orderId}`)
      const paymentData = await paymentResponse.json()

      if (paymentData.status === 'paid') {
        setPaymentStatus('paid')
      } else {
        // Attendre un peu et revérifier (le webhook peut prendre du temps)
        await new Promise(resolve => setTimeout(resolve, 2000))
        const retryResponse = await fetch(`/api/payment/checkout?orderId=${orderId}`)
        const retryData = await retryResponse.json()
        setPaymentStatus(retryData.status === 'paid' ? 'paid' : 'failed')
      }

      // Charger la commande
      const orderResponse = await fetch(`/api/orders?orderId=${orderId}`)
      const orderData = await orderResponse.json()

      if (orderData.order) {
        setOrder(orderData.order)
      }
    } catch (error) {
      console.error('Erreur:', error)
      setPaymentStatus('failed')
    } finally {
      setLoading(false)
    }
  }

  async function findOrderByVivaCode() {
    try {
      // Vérifier le statut via le orderCode Viva
      const paymentResponse = await fetch(`/api/payment/checkout?orderCode=${orderCode}`)
      const paymentData = await paymentResponse.json()

      if (paymentData.status === 'paid') {
        setPaymentStatus('paid')
        // Chercher la commande associée
        // Note: il faudrait une API pour chercher par viva_order_code
      } else {
        setPaymentStatus('failed')
      }
    } catch (error) {
      console.error('Erreur:', error)
      setPaymentStatus('failed')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-spin">⏳</span>
          <p className="text-gray-500">Vérification du paiement...</p>
        </div>
      </div>
    )
  }

  if (paymentStatus === 'failed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-lg">
          <span className="text-6xl block mb-4">❌</span>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Paiement échoué</h1>
          <p className="text-gray-500 mb-6">
            Le paiement n'a pas pu être effectué. Veuillez réessayer.
          </p>
          <Link
            href="/"
            className="inline-block bg-orange-500 text-white font-bold px-8 py-3 rounded-xl"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-lg">
        <span className="text-6xl block mb-4">✅</span>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Commande confirmée !</h1>
        <p className="text-gray-500 mb-6">Merci pour votre commande</p>

        {order && (
          <>
            <div className="bg-orange-50 rounded-2xl p-6 mb-6">
              <p className="text-gray-600 mb-2">Numéro de commande</p>
              <p className="text-4xl font-bold text-orange-500">{order.order_number}</p>
            </div>

            {order.pickup_code && (
              <div className="bg-gray-100 rounded-2xl p-6 mb-6">
                <p className="text-gray-600 mb-2">Code de retrait</p>
                <p className="text-3xl font-bold font-mono tracking-widest">
                  {order.pickup_code}
                </p>
              </div>
            )}

            {order.scheduled_time && (
              <div className="mb-6">
                <p className="text-gray-600">
                  {order.order_type === 'delivery' ? '🚗 Livraison' : '🥡 Retrait'} prévu le
                </p>
                <p className="font-bold text-lg">
                  {new Date(order.scheduled_time).toLocaleString('fr-BE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {order.establishment?.address && order.order_type === 'pickup' && (
                  <p className="text-gray-500 text-sm mt-1">
                    📍 {order.establishment.address}
                  </p>
                )}
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
              <p className="font-bold mb-2">Récapitulatif</p>
              {order.order_items?.map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm py-1">
                  <span>
                    {item.quantity}x {item.product_name}
                  </span>
                  <span>{item.line_total.toFixed(2)}€</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t pt-2 mt-2">
                <span>Total</span>
                <span className="text-orange-500">{order.total.toFixed(2)}€</span>
              </div>
            </div>
          </>
        )}

        <p className="text-gray-500 text-sm mb-6">
          Un email de confirmation vous a été envoyé.
        </p>

        <Link
          href="/"
          className="inline-block bg-orange-500 text-white font-bold px-8 py-3 rounded-xl"
        >
          Nouvelle commande
        </Link>
      </div>
    </div>
  )
}
