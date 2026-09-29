import './globals.css'

export const metadata = {
  title: 'Tahaluf Dashboard',
  description: 'Tahaluf Event Operations Overview',
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

