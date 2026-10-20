import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

/**
 * Web Audio API Synthesizer Fallback
 * Generates a clean, loud multi-tone kitchen chime (C5 -> E5 -> G5 -> C6)
 */
function playSynthesizedChime(volume = 0.9, soundTheme = 'chime') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    const now = ctx.currentTime
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(volume, now)
    gainNode.connect(ctx.destination)

    if (soundTheme === 'siren') {
      // Siren tone (alternating high pitch)
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(750, now)
      osc.frequency.linearRampToValueAtTime(1200, now + 0.2)
      osc.frequency.linearRampToValueAtTime(750, now + 0.4)
      osc.frequency.linearRampToValueAtTime(1200, now + 0.6)
      osc.connect(gainNode)
      osc.start(now)
      osc.stop(now + 0.8)
    } else if (soundTheme === 'bell') {
      // Bell ring
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1500, now)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
      osc.connect(gainNode)
      osc.start(now)
      osc.stop(now + 1.2)
    } else {
      // Default Chime (Arpeggio: C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50]
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const noteGain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.value = freq

        const startTime = now + idx * 0.12
        noteGain.gain.setValueAtTime(volume, startTime)
        noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5)

        osc.connect(noteGain)
        noteGain.connect(ctx.destination)

        osc.start(startTime)
        osc.stop(startTime + 0.5)
      })
    }
  } catch (e) {
    console.warn('Synthesized chime error:', e.message)
  }
}

export default function AdminNotificationListener() {
  const { user, isAdmin } = useAuth()
  const router = useRouter()

  const [activeAlertOrder, setActiveAlertOrder] = useState(null)
  const [audioAutoplayBlocked, setAudioAutoplayBlocked] = useState(false)
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  const isFirstLoad = useRef(true)
  const knownOrderIds = useRef(new Set())
  const soundIntervalRef = useRef(null)
  const audioRef = useRef(null)

  // Settings State
  const [settings, setSettings] = useState({
    soundEnabled: true,
    volume: 0.9,
    repeatAlert: false,
    soundTheme: 'chime'
  })

  // Load Settings from LocalStorage & Listen for updates
  useEffect(() => {
    const loadSettings = () => {
      try {
        const soundEnabled = localStorage.getItem('bs_admin_notif_sound') !== 'false'
        const volume = Number(localStorage.getItem('bs_admin_notif_volume')) || 0.9
        const repeatAlert = localStorage.getItem('bs_admin_notif_repeat') === 'true'
        const soundTheme = localStorage.getItem('bs_admin_notif_theme') || 'chime'
        setSettings({ soundEnabled, volume, repeatAlert, soundTheme })
      } catch (e) {}
    }
    loadSettings()

    const handleStorageChange = () => loadSettings()
    window.addEventListener('bs-settings-updated', handleStorageChange)
    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('bs-settings-updated', handleStorageChange)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  // Function to play sound alert
  const playAlertSound = (customVolume, customTheme) => {
    const vol = customVolume !== undefined ? customVolume : settings.volume
    const theme = customTheme !== undefined ? customTheme : settings.soundTheme

    if (!settings.soundEnabled && customVolume === undefined) return

    let played = false
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/new-order.mp3')
      }
      audioRef.current.volume = vol
      audioRef.current.currentTime = 0

      const playPromise = audioRef.current.play()
      if (playPromise !== undefined) {
        playPromise.then(() => {
          played = true
          setAudioAutoplayBlocked(false)
        }).catch((err) => {
          // Autoplay blocked — use synthesizer or show unlock banner
          playSynthesizedChime(vol, theme)
          if (!audioUnlocked) {
            setAudioAutoplayBlocked(true)
          }
        })
      }
    } catch (e) {
      playSynthesizedChime(vol, theme)
    }
  }

  // Stop sound loop
  const stopSoundLoop = () => {
    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current)
      soundIntervalRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }

  // Handle explicit audio unlock click
  const unlockAudioContext = () => {
    try {
      playAlertSound(settings.volume, settings.soundTheme)
      setAudioUnlocked(true)
      setAudioAutoplayBlocked(false)
    } catch (e) {}
  }

  // Firestore Realtime Listener
  useEffect(() => {
    if (!user || !isAdmin) return

    const unsub = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const liveOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

      if (isFirstLoad.current) {
        // Build set of existing known order IDs
        liveOrders.forEach(o => {
          if (o.id) knownOrderIds.current.add(o.id)
          if (o.orderId) knownOrderIds.current.add(o.orderId)
        })
        isFirstLoad.current = false
        return
      }

      // Check for newly added or newly confirmed orders
      for (const docChange of snapshot.docChanges()) {
        const data = docChange.doc.data() || {}
        const orderId = docChange.doc.id || data.orderId

        const isConfirmed = data.orderStatus === 'confirmed' ||
                            data.paymentStatus === 'paid' ||
                            data.status === 'confirmed' ||
                            data.status === 'Accepted' ||
                            data.status === 'Preparing'

        if (isConfirmed && orderId && !knownOrderIds.current.has(orderId)) {
          knownOrderIds.current.add(orderId)

          // Trigger New Order Alert UI + Sound
          const alertPayload = {
            id: orderId,
            orderId: data.orderId || orderId,
            grandTotal: data.grandTotal || 0,
            customerName: data.customerName || data.userName || 'Customer',
            customerPhone: data.customerPhone || data.userPhone || '',
            deliveryAddress: data.deliveryAddress || '',
            items: data.items || [],
            createdAt: data.createdAt
          }

          setActiveAlertOrder(alertPayload)

          // Play Sound
          playAlertSound()

          // Repeat alert sound if configured
          if (settings.repeatAlert) {
            stopSoundLoop()
            soundIntervalRef.current = setInterval(() => {
              playAlertSound()
            }, 4000)
          }

          // Mobile Haptic Vibration
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([300, 100, 300, 100, 400])
          }

          break // alert for newest order
        }
      }
    }, (err) => {
      console.warn('Realtime order listener notice:', err.message)
    })

    return () => {
      unsub()
      stopSoundLoop()
    }
  }, [user, isAdmin, settings])

  const acknowledgeAlert = () => {
    stopSoundLoop()
    setActiveAlertOrder(null)
  }

  const navigateToOrder = () => {
    stopSoundLoop()
    const targetId = activeAlertOrder?.orderId || activeAlertOrder?.id
    setActiveAlertOrder(null)
    if (targetId) {
      router.push(`/admin/orders?orderId=${encodeURIComponent(targetId)}`)
    } else {
      router.push('/admin/orders')
    }
  }

  if (!user || !isAdmin) return null

  return (
    <>
      {/* --- AUTOPLAY AUDIO UNLOCK BANNER --- */}
      {audioAutoplayBlocked && !activeAlertOrder && (
        <div style={{
          position: 'fixed',
          top: '12px',
          right: '12px',
          zIndex: 99999,
          background: 'linear-gradient(135deg, #CB202D 0%, #CB202D 100%)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '16px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontFamily: "'Outfit', sans-serif",
          fontSize: '0.88rem',
          fontWeight: 800,
          animation: 'bsPulse 2s infinite ease-in-out'
        }}>
          <span>🔊 Enable Order Sound Alerts</span>
          <button
            type="button"
            onClick={unlockAudioContext}
            style={{
              background: '#ffffff',
              color: '#CB202D',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '999px',
              fontWeight: 900,
              cursor: 'pointer',
              fontSize: '0.8rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            ENABLE NOW
          </button>
        </div>
      )}

      {/* --- PROMINENT NEW ORDER MODAL OVERLAY --- */}
      {activeAlertOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999999,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          fontFamily: "'Outfit', sans-serif"
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            background: 'linear-gradient(145deg, #ffffff 0%, #f9fafb 100%)',
            borderRadius: '28px',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 40px rgba(180,74,52, 0.3)',
            border: '2px solid var(--deep-green, #CB202D)',
            overflow: 'hidden',
            animation: 'bsModalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            {/* Header Tag */}
            <div style={{
              background: 'linear-gradient(135deg, #CB202D 0%, #CB202D 100%)',
              color: '#ffffff',
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.6rem', animation: 'bsRing 1s infinite alternate' }}>🔔</span>
                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', color: '#a7f3d0' }}>REALTIME ORDER ALERT</span>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>NEW ORDER RECEIVED!</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={acknowledgeAlert}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: '#ffffff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Body Info */}
            <div style={{ padding: '24px' }}>
              <div style={{
                background: '#ecfdf5',
                border: '1px dashed #CB202D',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#CB202D', fontWeight: 800 }}>ORDER NUMBER</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#6B0808' }}>
                    #{activeAlertOrder.orderId.replace('BB-PATNA-', '')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.78rem', color: '#CB202D', fontWeight: 800 }}>AMOUNT PAID</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#CB202D' }}>
                    ₹{Math.round(activeAlertOrder.grandTotal)}
                  </div>
                </div>
              </div>

              {/* Items Summary */}
              {Array.isArray(activeAlertOrder.items) && activeAlertOrder.items.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 900, color: '#6b7280', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                    ITEMS ORDERED ({activeAlertOrder.items.length})
                  </span>
                  <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '12px 14px', maxHeight: '120px', overflowY: 'auto' }}>
                    {activeAlertOrder.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', fontWeight: 700, padding: '4px 0', borderBottom: i < activeAlertOrder.items.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        <span style={{ color: '#1f2937' }}>{item.qty || 1}x {item.title}</span>
                        <span style={{ color: '#CB202D' }}>₹{Math.round((item.price || 0) * (item.qty || 1))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Details */}
              <div style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '14px', padding: '12px 14px', fontSize: '0.85rem', color: '#4b5563', marginBottom: '24px' }}>
                <div style={{ fontWeight: 800, color: '#111827', marginBottom: '2px' }}>
                  👤 {activeAlertOrder.customerName} {activeAlertOrder.customerPhone ? `• 📞 ${activeAlertOrder.customerPhone}` : ''}
                </div>
                {activeAlertOrder.deliveryAddress && (
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
                    📍 {activeAlertOrder.deliveryAddress}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  onClick={acknowledgeAlert}
                  style={{
                    padding: '14px',
                    borderRadius: '16px',
                    border: '1.5px solid #d1d5db',
                    background: '#ffffff',
                    color: '#374151',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  🔕 ACKNOWLEDGE
                </button>
                <button
                  type="button"
                  onClick={navigateToOrder}
                  style={{
                    padding: '14px',
                    borderRadius: '16px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #CB202D 0%, #CB202D 100%)',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(180,74,52,0.35)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  📦 VIEW ORDER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded CSS Animations */}
      <style jsx global>{`
        @keyframes bsModalPop {
          0% { opacity: 0; transform: scale(0.85) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bsRing {
          0% { transform: rotate(-12deg); }
          100% { transform: rotate(12deg); }
        }
        @keyframes bsPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
      `}</style>
    </>
  )
}
