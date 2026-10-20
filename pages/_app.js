import { useEffect } from 'react'
import '../styles/globals.css'
import Head from 'next/head'
import { AuthProvider } from '../context/AuthContext'
import { SettingsProvider } from '../context/SettingsContext'
import { OrdersProvider } from '../context/OrdersContext'
import AuthModal from '../components/AuthModal'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // 1. Harmless Network Error Suppression
    const handleUnhandledRejection = (event) => {
      const reason = event?.reason
      const msg = (reason?.message || String(reason || '')).toLowerCase()
      const name = reason?.name || ''
      const stack = (reason?.stack || '').toLowerCase()

      const isHarmlessNetworkError =
        name === 'AbortError' ||
        msg.includes('failed to fetch') ||
        msg.includes('signal is aborted') ||
        msg.includes('webchannel') ||
        msg.includes('aborted') ||
        stack.includes('webchannel') ||
        stack.includes('injectscriptadjust')

      if (isHarmlessNetworkError) {
        event.preventDefault()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleUnhandledRejection)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      }
    }
  }, [])

  return (
    <AuthProvider>
      <SettingsProvider>
        <OrdersProvider>
          <Head>
            <meta charSet="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Biryani Badshah | Charcoal Kawabs & Dum Biryanis</title>
            <meta name="description" content="Biryani Badshah - Dum Pukht biryani & clay-oven tandoori kawabs, slow-cooked over real fire." />
          </Head>
          <Component {...pageProps} />
          <AuthModal />
        </OrdersProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}
