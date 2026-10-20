import { useState } from 'react'

export default function UpiPaymentBox({
  grandTotal,
  amount,
  orderId = '',
  restaurantName = 'Biryani Badshah',
  upiId = 'electrohousejsr@okicici',
  onConfirmPayment,
  onVerify,
  loading = false
}) {
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState('idle') // 'idle' | 'confirm' | 'utr'
  const [upiPayerName, setUpiPayerName] = useState('')

  const rawTotal = grandTotal !== undefined && grandTotal !== null ? grandTotal : (amount !== undefined && amount !== null ? amount : 0)
  const numericTotal = typeof rawTotal === 'number' && !isNaN(rawTotal) ? rawTotal : (parseFloat(rawTotal) || 0)
  const totalFormatted = numericTotal.toFixed(0)
  const formattedAmount = Number(numericTotal).toFixed(2)

  const displayOrderId = orderId || 'BB-' + Math.floor(100000 + Math.random() * 900000)

  const upiUri =
    `upi://pay?pa=${upiId}` +
    `&pn=${encodeURIComponent(restaurantName)}` +
    `&am=${formattedAmount}` +
    `&cu=INR` +
    `&tn=${encodeURIComponent(displayOrderId)}`

  if (typeof window !== 'undefined') {
    console.log('[UPI Payment] Generated URI:', upiUri)
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(upiUri)}&size=240x240&margin=10`

  const handleCopyUpi = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(upiId)
      } else {
        const input = document.createElement('input')
        input.value = upiId
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      console.warn('Clipboard copy error:', e)
    }
  }

  const handleOpenUpiApp = () => {
    window.location.href = upiUri
  }

  const handleFinalSubmit = (e, val) => {
    const cleanVal = (val !== undefined && val !== null ? val : upiPayerName).trim()
    if (!cleanVal) {
      alert('⚠️ UPI Number is mandatory! Please enter the UPI Phone Number or UPI ID used to make the payment.')
      return
    }
    setStep('idle')
    const confirmFn = onConfirmPayment || onVerify
    if (typeof confirmFn === 'function') {
      confirmFn(e, cleanVal)
    }
  }

  return (
    <div style={{ background: '#FFFDF2', border: '1px solid rgba(203, 32, 45,0.18)', borderRadius: '20px', padding: '20px', marginTop: '16px' }}>
      
      {/* Total Amount Header */}
      <div style={{ textAlign: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px dashed rgba(0,0,0,0.1)' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.15em', color: 'var(--muted)', textTransform: 'uppercase' }}>
          AMOUNT DUE
        </span>
        <h3 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--deep-green)', margin: '2px 0 0 0' }}>
          ₹{totalFormatted}
        </h3>
      </div>

      {/* Dynamic UPI QR Code Card */}
      <div style={{ background: '#ffffff', padding: '18px 16px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.04)', marginBottom: '16px' }}>
        <span style={{ display: 'inline-block', background: 'rgba(203, 32, 45,0.08)', color: 'var(--deep-green)', padding: '4px 12px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', marginBottom: '10px' }}>
          DYNAMIC UPI QR • ₹{totalFormatted} PRE-FILLED
        </span>
        <img loading="lazy" decoding="async" 
          src={qrUrl}
          alt={`Dynamic UPI QR Code for ₹${totalFormatted}`}
          className="upi-qr-image"
          style={{ width: '220px', height: '220px', margin: '0 auto', display: 'block', borderRadius: '16px', border: '1.5px solid rgba(203, 32, 45,0.12)', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
        />
        
        {/* Step-by-Step Payment Guide Box */}
        <div style={{ marginTop: '14px', background: '#FFFDF2', border: '1px solid rgba(203, 32, 45,0.12)', borderRadius: '12px', padding: '12px', textAlign: 'left', fontSize: '0.82rem', color: 'var(--ink)' }}>
          <strong style={{ color: 'var(--deep-green)', display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>
            📲 How to Pay:
          </strong>
          <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', lineHeight: 1.4 }}>
            <li><strong>Screenshot</strong> this QR Code (or scan with camera).</li>
            <li>Open <strong>GPay / PhonePe / Paytm / BHIM</strong>.</li>
            <li>Tap <strong>Scan QR → Select photo from Gallery</strong>.</li>
            <li>Amount <strong>₹{totalFormatted}</strong> is pre-filled automatically!</li>
          </ol>
        </div>
      </div>

      {/* UPI Details & Copy Button */}
      <div style={{ background: '#ffffff', borderRadius: '14px', padding: '12px 14px', marginBottom: '16px', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700 }}>UPI ID</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700 }}>ORDER ID</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ fontSize: '0.92rem', color: 'var(--ink)' }}>{upiId}</strong>
            <button
              type="button"
              onClick={handleCopyUpi}
              style={{
                background: copied ? 'rgba(203, 32, 45,0.15)' : 'rgba(0,0,0,0.05)',
                color: copied ? 'var(--deep-green)' : 'var(--ink)',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <strong style={{ fontSize: '0.88rem', color: 'var(--deep-green)' }}>#{displayOrderId}</strong>
        </div>
      </div>

      {/* Already Paid Confirmation Button */}
      <button
        type="button"
        onClick={() => setStep('confirm')}
        disabled={loading}
        style={{
          width: '100%',
          background: 'var(--deep-green)',
          color: '#ffffff',
          border: 'none',
          padding: '14px',
          borderRadius: '14px',
          fontWeight: 800,
          fontSize: '0.92rem',
          cursor: loading ? 'wait' : 'pointer',
          boxShadow: '0 4px 12px rgba(203, 32, 45,0.2)'
        }}
      >
        {loading ? 'Submitting Order...' : "✓ I've Completed Payment"}
      </button>

      {/* Help Line */}
      <p style={{ margin: '10px 0 0 0', textAlign: 'center', fontSize: '0.78rem', color: 'var(--muted)' }}>
        Need help? Call restaurant: <a href="tel:+919693999890" style={{ color: 'var(--deep-green)', fontWeight: 800 }}>+91 96939 99890</a>
      </p>

      {/* STEP 1 MODAL: Confirm Payment */}
      {step === 'confirm' && (
        <>
          <div
            onClick={() => setStep('idle')}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', zIndex: 99998, backdropFilter: 'blur(4px)' }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(420px, 92vw)',
              background: '#ffffff',
              borderRadius: '24px',
              padding: '28px 24px',
              textAlign: 'center',
              zIndex: 99999,
              boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
              border: '2px solid var(--deep-green)'
            }}
          >
            <div style={{ fontSize: '2.8rem', marginBottom: '10px' }}>📲</div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--ink)', margin: '0 0 8px 0' }}>
              Confirm Payment
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '24px' }}>
              Have you successfully completed your UPI payment of <strong style={{ color: 'var(--deep-green)', fontSize: '1rem' }}>₹{totalFormatted}</strong>?
              <br/>
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Only continue if you have already transferred the payment.</span>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setStep('idle')}
                style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.2)', background: '#ffffff', color: 'var(--ink)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep('utr')}
                style={{ padding: '12px', borderRadius: '12px', border: 'none', background: 'var(--deep-green)', color: '#ffffff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(203, 32, 45,0.3)' }}
              >
                Yes, I've Paid
              </button>
            </div>
          </div>
        </>
      )}

      {/* STEP 2 MODAL: UPI Account Holder Name Input */}
      {step === 'utr' && (
        <>
          <div
            onClick={() => setStep('idle')}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', zIndex: 99998, backdropFilter: 'blur(4px)' }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(420px, 92vw)',
              background: '#ffffff',
              borderRadius: '24px',
              padding: '28px 24px',
              textAlign: 'center',
              zIndex: 99999,
              boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
              border: '2px solid var(--deep-green)'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📲</div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--ink)', margin: '0 0 6px 0' }}>
              UPI NUMBER / ID *
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', lineHeight: 1.4, marginBottom: '18px' }}>
              Enter the <strong>UPI Phone Number or UPI ID</strong> (GPay, PhonePe, Paytm number/ID) used to send the payment.
            </p>

            <input
              type="text"
              placeholder="e.g. 9693999890 or username@upi"
              value={upiPayerName}
              onChange={(e) => setUpiPayerName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '12px',
                border: upiPayerName.trim() ? '2px solid var(--deep-green)' : '1.5px solid #dc2626',
                fontSize: '0.95rem',
                fontWeight: 800,
                textAlign: 'center',
                marginBottom: '20px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.2)', background: '#ffffff', color: 'var(--ink)', fontWeight: 800, fontSize: '0.86rem', cursor: 'pointer' }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={(e) => handleFinalSubmit(e, upiPayerName)}
                style={{ padding: '12px', borderRadius: '12px', border: 'none', background: 'var(--deep-green)', color: '#ffffff', fontWeight: 900, fontSize: '0.92rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(203, 32, 45,0.3)' }}
              >
                Submit Order ✅
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
