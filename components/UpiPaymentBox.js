import React from 'react'

/**
 * CodPaymentBox (replaces legacy UpiPaymentBox)
 * Pure Cash On Delivery payment confirmation card.
 */
export default function CodPaymentBox({
  grandTotal,
  amount,
  onConfirmPayment,
  onVerify,
  loading = false
}) {
  const rawTotal = grandTotal !== undefined && grandTotal !== null ? grandTotal : (amount !== undefined && amount !== null ? amount : 0)
  const numericTotal = typeof rawTotal === 'number' && !isNaN(rawTotal) ? rawTotal : (parseFloat(rawTotal) || 0)
  const totalFormatted = numericTotal.toFixed(0)

  const handleConfirm = (e) => {
    const fn = onConfirmPayment || onVerify
    if (typeof fn === 'function') {
      fn(e)
    }
  }

  return (
    <div className="cod-box-wrapper">
      <div className="cod-selection-card">
        <span className="cod-active-badge">
          <span>●</span> ACTIVE PAYMENT
        </span>
        <div className="cod-icon-wrap">
          💵
        </div>
        <div className="cod-meta-info">
          <h4 className="cod-meta-title">Cash on Delivery (COD)</h4>
          <p className="cod-meta-desc">Pay cash to our delivery rider at your doorstep when your food arrives.</p>
        </div>
        <div className="cod-check-indicator">
          ✓
        </div>
      </div>

      <div className="cod-change-tip">
        <span>💡</span>
        <div>
          <strong>Payable Amount: ₹{totalFormatted}</strong>
          <div>Please keep cash ready for your rider at doorstep delivery.</div>
        </div>
      </div>

      <div className="cod-assurance-grid">
        <div className="cod-assurance-item">
          <span className="cod-assurance-icon">⚡</span>
          <span><strong>Fast Kitchen Processing:</strong> Cooked fresh upon order confirmation.</span>
        </div>
        <div className="cod-assurance-item">
          <span className="cod-assurance-icon">🛡️</span>
          <span><strong>Zero Prepayment:</strong> Inspect your meal before paying.</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={loading}
        className="cod-submit-btn"
      >
        <span>{loading ? '⏳ PLACING YOUR COD ORDER...' : 'CONFIRM CASH ON DELIVERY ➔'}</span>
        <span className="cod-submit-price-badge">₹{totalFormatted}</span>
      </button>
    </div>
  )
}
