import './globals.css'
import { Anton, Open_Sans } from 'next/font/google'

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton' })
const openSans = Open_Sans({ subsets: ['latin'], variable: '--font-open-sans' })

export const metadata = {
  title: 'Tahaluf Dashboard',
  description: 'Tahaluf Event Operations Overview',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tahaluf'
  },
  icons: {
    icon: '/tahaluf-logo.svg',
    apple: '/logo-new.png'
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0a2442'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${anton.variable} ${openSans.variable}`}>
      <body className="font-sans antialiased text-white">
        {children}
      </body>
    </html>
  )
}
