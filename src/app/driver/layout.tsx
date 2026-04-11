import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'DeliDjambo',
  description: 'Application livreur MDjambo',
  manifest: '/delidjambo-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DeliDjambo',
  },
  icons: {
    apple: '/delidjambo-icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}