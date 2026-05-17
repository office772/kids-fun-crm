import type { Metadata } from 'next'
import { Rubik } from 'next/font/google'
import './globals.css'

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-rubik',
})

export const metadata: Metadata = {
  title: 'Kids & Fun — מערכת ניהול',
  description: 'מערכת ניהול לקוחות לצהרונים וקייטנות',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${rubik.variable} antialiased`}
        style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
