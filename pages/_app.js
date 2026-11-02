import { useEffect } from 'react'
import '../styles/globals.css'
import Head from 'next/head'
import { AuthProvider } from '../context/AuthContext'
import { SettingsProvider } from '../context/SettingsContext'
import { OrdersProvider } from '../context/OrdersContext'
import AuthModal from '../components/AuthModal'

// Early global suppression for browser/network abort errors in dev & production
if (typeof window !== 'undefined') {
  const isHarmlessNetworkError = (err) => {
    if (!err) return false
    const msg = (err?.message || String(err || '')).toLowerCase()
    const name = err?.name || ''
    const stack = (err?.stack || '').toLowerCase()

    return (
      name === 'AbortError' ||
      msg.includes('abort') ||
      msg.includes('signal is aborted') ||
      msg.includes('failed to fetch') ||
      msg.includes('webchannel') ||
      stack.includes('webchannel') ||
      stack.includes('injectscriptadjust')
    )
  }

  const handleGlobalRejection = (event) => {
    if (isHarmlessNetworkError(event?.reason)) {
      event.preventDefault()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
    }
  }

  const handleGlobalError = (event) => {
    if (isHarmlessNetworkError(event?.error) || isHarmlessNetworkError(event?.message)) {
      event.preventDefault()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
    }
  }

  window.addEventListener('unhandledrejection', handleGlobalRejection, true)
  window.addEventListener('error', handleGlobalError, true)
}

export default function App({ Component, pageProps }) {

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
