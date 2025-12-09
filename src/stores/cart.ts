import { create } from 'zustand'

export type CartItem = {
  id: string
  product_id: string
  name: string
  price: number
  quantity: number
  image_url?: string | null
  options?: {
    id: string
    name: string
    price: number
  }[]
}

type OrderType = 'eat_in' | 'takeaway'

type CartStore = {
  items: CartItem[]
  orderType: OrderType
  
  // Actions
  addItem: (item: Omit<CartItem, 'id' | 'quantity'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  setOrderType: (type: OrderType) => void
  
  // Computed
  getTotal: () => number
  getItemCount: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  orderType: 'takeaway',
  
  addItem: (item) => {
    const { items } = get()
    
    // Check if item already exists (same product, same options)
    const existingIndex = items.findIndex(
      i => i.product_id === item.product_id && 
           JSON.stringify(i.options) === JSON.stringify(item.options)
    )
    
    if (existingIndex > -1) {
      // Increment quantity
      const newItems = [...items]
      newItems[existingIndex].quantity += 1
      set({ items: newItems })
    } else {
      // Add new item
      const newItem: CartItem = {
        ...item,
        id: crypto.randomUUID(),
        quantity: 1,
      }
      set({ items: [...items, newItem] })
    }
  },
  
  removeItem: (id) => {
    set({ items: get().items.filter(item => item.id !== id) })
  },
  
  updateQuantity: (id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(id)
      return
    }
    
    set({
      items: get().items.map(item =>
        item.id === id ? { ...item, quantity } : item
      )
    })
  },
  
  clearCart: () => {
    set({ items: [], orderType: 'takeaway' })
  },
  
  setOrderType: (type) => {
    set({ orderType: type })
  },
  
  getTotal: () => {
    return get().items.reduce((total, item) => {
      const optionsPrice = item.options?.reduce((sum, opt) => sum + opt.price, 0) || 0
      return total + (item.price + optionsPrice) * item.quantity
    }, 0)
  },
  
  getItemCount: () => {
    return get().items.reduce((count, item) => count + item.quantity, 0)
  },
}))
