import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"

// Using Inter font because it's clean and professional
const inter = Inter({ subsets: ["latin"] })

// SEO metadata - keeping it professional but searchable
export const metadata: Metadata = {
  title: "Keystroke Dynamic Authentication",
  description: "Advanced biometric authentication using machine learning analysis of typing patterns",
}

// Root layout component - wrapping everything in theme provider
// Note: suppressHydrationWarning needed for theme switching
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Dark theme by default because we're going for that cybersec aesthetic */}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
