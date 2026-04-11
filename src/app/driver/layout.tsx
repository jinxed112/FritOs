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
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <head>
        <link rel="apple-touch-icon" href="/delidjambo-icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <RegisterSW />
      {children}
    </>
  )
}

function RegisterSW() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/delidjambo-sw.js', { scope: '/driver' })
            })
          }
        `,
      }}
    />
  )
}
