import React from 'react'

export default function ToastNotification({ toast }) {
  if (!toast) return null

  return (
    <div className={`cart-toast ${toast ? 'show' : ''}`} aria-hidden={toast ? 'false' : 'true'}>
      {toast.image && <img loading="lazy" decoding="async"  src={toast.image} alt={toast.title || 'Notification'} />}
      <div className="cart-toast-text">
        <span>{toast.subtitle || 'Added to cart'}</span>
        <p>{toast.title || toast.message || toast}</p>
      </div>
    </div>
  )
}
