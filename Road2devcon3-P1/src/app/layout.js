import './globals.css'
import Providers from './providers'

export const metadata = {
  title: "Ramesh Bakery Loyalty",
  description: "Loyalty stamps you cannot photocopy - powered by embedded wallets",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
