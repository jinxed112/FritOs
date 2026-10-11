import { Plus_Jakarta_Sans } from 'next/font/google'

// Police de la caisse : plus lisible au toucher qu'Inter, chiffres tabulaires
// pour que les prix restent alignés dans le panier.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })

export default function CounterLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.className} tabular-nums`}>{children}</div>
}
