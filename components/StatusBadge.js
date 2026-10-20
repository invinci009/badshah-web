import React from 'react'

export const getStatusMeta = (status, isDelivered, isCancelled) => {
  const normStatus = (status || '').toLowerCase()
  if (isDelivered || normStatus === 'delivered') {
    return { color: '#CB202D', bg: '#EFF3E6', text: 'DELIVERED', icon: '🟢' }
  }
  if (isCancelled || normStatus === 'cancelled') {
    return { color: '#dc2626', bg: '#fce8e6', text: 'CANCELLED', icon: '🔴' }
  }
  switch (normStatus) {
    case 'upi verification pending':
    case 'payment_verification_pending':
      return { color: '#b45309', bg: '#fef3c7', text: 'UPI VERIFICATION REQUIRED', icon: '💳' }
    case 'pending':
      return { color: '#d97706', bg: '#fef3c7', text: 'PENDING CONFIRMATION', icon: '⏳' }
    case 'accepted':
    case 'payment_verified':
    case 'payment verified':
      return { color: '#1a73e8', bg: '#e8f0fe', text: 'ACCEPTED', icon: '👍' }
    case 'preparing':
      return { color: '#d97706', bg: '#fef3c7', text: 'PREPARING IN KITCHEN', icon: '👨‍🍳' }
    case 'ready':
    case 'ready_for_delivery':
      return { color: '#7e22ce', bg: '#f3e8ff', text: 'READY FOR PICKUP', icon: '🍱' }
    case 'out for delivery':
    case 'out_for_delivery':
      return { color: '#0891b2', bg: '#e0f2fe', text: 'OUT FOR DELIVERY', icon: '🛵' }
    default:
      return { color: '#CB202D', bg: '#EFF3E6', text: (status || 'CONFIRMED').toUpperCase(), icon: '📦' }
  }
}

export default function StatusBadge({ status, isDelivered, isCancelled, style = {} }) {
  const meta = getStatusMeta(status, isDelivered, isCancelled)
  return (
    <span
      className="status-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        color: meta.color,
        background: meta.bg,
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      <span>{meta.icon}</span>
      <span>{meta.text}</span>
    </span>
  )
}
