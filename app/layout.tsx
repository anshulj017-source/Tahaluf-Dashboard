import './globals.css'

export const metadata = {
  title: 'Asia Cup 2027 Dashboard',
  description: 'Asia Cup LOC Overview',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}

