'use client'

import { useState } from 'react'

type PrintTicketButtonProps = {
  orderId: string
  type?: 'customer' | 'kitchen' | 'both'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function PrintTicketButton({ 
  orderId, 
  type = 'customer',
  size = 'md',
  className = ''
}: PrintTicketButtonProps) {
  const [printing, setPrinting] = useState(false)

  async function printTicket(ticketType: 'customer' | 'kitchen') {
    setPrinting(true)
    
    try {
      // Ouvrir le ticket dans une nouvelle fenêtre pour impression
      const url = `/api/ticket?orderId=${orderId}&type=${ticketType}`
      const printWindow = window.open(url, '_blank', 'width=350,height=600')
      
      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print()
          }, 500)
        }
      }
    } catch (error) {
      console.error('Print error:', error)
      alert('Erreur lors de l\'impression')
    } finally {
      setPrinting(false)
    }
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2',
    lg: 'px-4 py-3 text-lg',
  }

  if (type === 'both') {
    return (
      <div className={`flex gap-2 ${className}`}>
        <button
          onClick={() => printTicket('kitchen')}
          disabled={printing}
          className={`bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1 ${sizeClasses[size]}`}
        >
          🍳 Cuisine
        </button>
        <button
          onClick={() => printTicket('customer')}
          disabled={printing}
          className={`bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1 ${sizeClasses[size]}`}
        >
          🧾 Client
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => printTicket(type)}
      disabled={printing}
      className={`bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1 ${sizeClasses[size]} ${className}`}
    >
      🖨️ {printing ? '...' : 'Imprimer'}
    </button>
  )
}