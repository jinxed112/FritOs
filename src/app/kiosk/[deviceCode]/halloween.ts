import { Fraunces, Archivo_Black } from 'next/font/google'

// Thème de la borne des soirées au Boribar (Brasserie du Borinage), Halloween 2026.
// Activé par devices.config.theme, ou par ?theme= dans l'URL pour un aperçu.
export const HALLOWEEN_THEME = 'halloween-borinage'

export const CORAIL = '#E8603C'

export const titre = Fraunces({ subsets: ['latin'], weight: '900' })
export const gras = Archivo_Black({ subsets: ['latin'], weight: '400' })

const DOSSIER = '/themes/halloween-borinage'
export const GHOSTFACE = `${DOSSIER}/ghostface.webp`
export const LOGO_BORIBAR = `${DOSSIER}/logo-boribar.png`

// Photos Halloween par nom de produit (en minuscules) ; à défaut, la photo du catalogue
const PHOTOS: Record<string, string> = {}

export function photoHalloween(product: { name: string; image_url: string | null }): string | null {
  return PHOTOS[product.name.trim().toLowerCase()] ?? product.image_url
}
