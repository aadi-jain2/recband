import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Korazia — Clinical Dashboard",
  description: "Post-discharge 30-day readmission prevention — AI-powered wearable monitoring",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
