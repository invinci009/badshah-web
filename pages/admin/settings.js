import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../components/AdminLayout'
import AnnouncementBanner from '../../components/AnnouncementBanner'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function AdminSettingsDesk() {
  const { user, isAdmin, accessToken } = useAuth()
  const [restaurantName, setRestaurantName] = useState('Biryani Badshah')
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [deliveryCharge, setDeliveryCharge] = useState('40')
  const [gstPercentage, setGstPercentage] = useState('18')
  const [openingTime, setOpeningTime] = useState('11:00 AM')
  const [closingTime, setClosingTime] = useState('11:30 PM')
  const [supportPhone, setSupportPhone] = useState('+91 96939 99890')
  const [storeUpiId, setStoreUpiId] = useState('electrohousejsr@okicici')
  const [restaurantAddress, setRestaurantAddress] = useState('Phulwari Rd, Near Shaheed Bhagat Singh Chowk, Birla Colony, Phulwari Sharif, Patna, Bihar')
  const [googlePlaceId, setGooglePlaceId] = useState('')
  
  // Announcement Banner State
  const [announcementEnabled, setAnnouncementEnabled] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementType, setAnnouncementType] = useState('info')
  const [announcementError, setAnnouncementError] = useState('')

  // Admin Order Notification & Sound State
  const [pushEnabled, setPushEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [soundVolume, setSoundVolume] = useState(90)
  const [repeatAlert, setRepeatAlert] = useState(false)
  const [soundTheme, setSoundTheme] = useState('chime')
  const [permissionStatus, setPermissionStatus] = useState('default')
  const [subscribing, setSubscribing] = useState(false)
  const [testPushing, setTestPushing] = useState(false)
  const [testTelegramming, setTestTelegramming] = useState(false)
  const [notifMessage, setNotifMessage] = useState('')

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission)
    }
    try {
      setPushEnabled(localStorage.getItem('bs_admin_push_enabled') !== 'false')
      setSoundEnabled(localStorage.getItem('bs_admin_notif_sound') !== 'false')
      setSoundVolume(Number(localStorage.getItem('bs_admin_notif_volume')) ? Number(localStorage.getItem('bs_admin_notif_volume')) * 100 : 90)
      setRepeatAlert(localStorage.getItem('bs_admin_notif_repeat') === 'true')
      setSoundTheme(localStorage.getItem('bs_admin_notif_theme') || 'chime')
    } catch (e) {}
  }, [])

  const saveNotificationPreferences = (newSettings) => {
    try {
      if (newSettings.soundEnabled !== undefined) {
        localStorage.setItem('bs_admin_notif_sound', String(newSettings.soundEnabled))
      }
      if (newSettings.soundVolume !== undefined) {
        localStorage.setItem('bs_admin_notif_volume', String(newSettings.soundVolume / 100))
      }
      if (newSettings.repeatAlert !== undefined) {
        localStorage.setItem('bs_admin_notif_repeat', String(newSettings.repeatAlert))
      }
      if (newSettings.soundTheme !== undefined) {
        localStorage.setItem('bs_admin_notif_theme', newSettings.soundTheme)
      }
      if (newSettings.pushEnabled !== undefined) {
        localStorage.setItem('bs_admin_push_enabled', String(newSettings.pushEnabled))
      }
      window.dispatchEvent(new Event('bs-settings-updated'))
    } catch (e) {}
  }

  const handleEnablePushNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Web Push notifications are not supported on this browser.')
      return
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      alert('VAPID Public Key not found in environment variables (NEXT_PUBLIC_VAPID_PUBLIC_KEY). Please add it to your .env.local file.')
      return
    }

    try {
      setSubscribing(true)
      const permission = await Notification.requestPermission()
      setPermissionStatus(permission)

      if (permission !== 'granted') {
        alert('Notification permission was blocked or dismissed.')
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        const convertedKey = urlBase64ToUint8Array(vapidPublicKey)
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey
        })
      }

      const subJson = subscription.toJSON()
      const res = await fetch('/api/admin/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          subscription: subJson,
          userAgent: navigator.userAgent
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Subscription failed')

      setPushEnabled(true)
      saveNotificationPreferences({ pushEnabled: true })
      setNotifMessage('✅ Web Push notifications enabled successfully on this device!')
      setTimeout(() => setNotifMessage(''), 4500)
    } catch (err) {
      alert('Failed to enable push notifications: ' + err.message)
    } finally {
      setSubscribing(false)
    }
  }

  const handleTestPushNotification = async () => {
    try {
      setTestPushing(true)
      // Play chime sound chime on test
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          const now = ctx.currentTime
          const notes = [523.25, 659.25, 783.99, 1046.50]
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator()
            const noteGain = ctx.createGain()
            osc.type = 'sine'
            osc.frequency.value = freq
            const startTime = now + idx * 0.12
            noteGain.gain.setValueAtTime(0.9, startTime)
            noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5)
            osc.connect(noteGain)
            noteGain.connect(ctx.destination)
            osc.start(startTime)
            osc.stop(startTime + 0.5)
          })
        }
      } catch (e) {}

      const res = await fetch('/api/admin/notifications/test-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Test push failed')
      alert(data.message || 'Test push notification sent successfully!')
    } catch (err) {
      alert('Error testing push notification: ' + err.message)
    } finally {
      setTestPushing(false)
    }
  }

  const handleTestTelegramNotification = async () => {
    try {
      setTestTelegramming(true)
      const res = await fetch('/api/admin/notifications/test-telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Telegram test failed')
      alert(data.message || 'Telegram test message sent successfully!')
    } catch (err) {
      alert('Telegram Test Error: ' + err.message)
    } finally {
      setTestTelegramming(false)
    }
  }

  const handleTestOrderSound = () => {
    try {
      const vol = soundVolume / 100
      const audio = new Audio('/sounds/new-order.mp3')
      audio.volume = vol
      audio.play().catch(() => {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          const now = ctx.currentTime
          const gain = ctx.createGain()
          gain.gain.value = vol
          gain.connect(ctx.destination)
          const notes = [523.25, 659.25, 783.99, 1046.50]
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator()
            osc.frequency.value = freq
            osc.connect(gain)
            osc.start(now + idx * 0.12)
            osc.stop(now + idx * 0.12 + 0.4)
          })
        }
      })
    } catch (e) {}
  }

  useEffect(() => {
    if (!user) return
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'restaurant'))
        if (snap.exists()) {
          const data = snap.data()
          setRestaurantName(data.restaurantName || 'Biryani Badshah')
          setIsStoreOpen(data.isStoreOpen ?? true)
          setDeliveryCharge(data.deliveryCharge !== undefined ? String(data.deliveryCharge) : '40')
          setGstPercentage(data.gstPercentage !== undefined ? String(data.gstPercentage) : '18')
          setOpeningTime(data.openingTime || '11:00 AM')
          setClosingTime(data.closingTime || '11:30 PM')
          setSupportPhone(data.supportPhone || '+91 96939 99890')
          setStoreUpiId((data.storeUpiId && !data.storeUpiId.includes('8271301179') && !data.storeUpiId.includes('Q441280679')) ? data.storeUpiId : 'electrohousejsr@okicici')
          setRestaurantAddress(data.restaurantAddress || 'Phulwari Rd, Near Shaheed Bhagat Singh Chowk, Birla Colony, Phulwari Sharif, Patna, Bihar')
          setGooglePlaceId(data.googlePlaceId || '')

          setAnnouncementEnabled(Boolean(data.announcementEnabled))
          setAnnouncementText(data.announcementText || '')
          setAnnouncementType(data.announcementType || 'info')
        }
      } catch (e) {
        console.warn('Load settings notice:', e.message)
      }
    }
    loadSettings()
  }, [user])

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setAnnouncementError('')

    // Validation Rules for Global Announcement Banner
    if (announcementEnabled) {
      const trimmedText = announcementText.trim()
      if (!trimmedText) {
        setAnnouncementError('⚠️ Announcement text cannot be empty when the banner is enabled.')
        return
      }
      if (trimmedText.length > 5000) {
        setAnnouncementError(`⚠️ Announcement text exceeds maximum allowed length of 5000 characters (${trimmedText.length}/5000).`)
        return
      }
    }

    try {
      setSaving(true)
      const cleanAnnouncementText = announcementText.trim()

      await setDoc(doc(db, 'settings', 'restaurant'), {
        restaurantName,
        isStoreOpen,
        deliveryCharge: Number(deliveryCharge) || 0,
        gstPercentage: Number(gstPercentage) || 0,
        openingTime,
        closingTime,
        supportPhone,
        storeUpiId,
        restaurantAddress,
        googlePlaceId: (googlePlaceId || '').trim(),
        announcementEnabled,
        announcementText: cleanAnnouncementText,
        announcementType,
        updatedAt: serverTimestamp()
      }, { merge: true })

      setMessage('✨ All Settings & Announcement published successfully! Changes are live across the website.')
      setTimeout(() => setMessage(''), 4500)
    } catch (err) {
      alert('Error saving settings: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!user || !isAdmin) return null

  return (
    <AdminLayout activePage="settings" title="Restaurant Settings">
      <div className="admin-page-container" style={{ maxWidth: '840px' }}>
        <header className="admin-page-header">
          <div>
            <span className="admin-sub-tag">LIVE CONFIGURATION ENGINE</span>
            <h1 className="admin-page-h1">Restaurant Settings & Announcements</h1>
          </div>
        </header>

        {message && (
          <div className="adm-msg-toast">
            {message}
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="settings-form">
          {/* ORDER NOTIFICATIONS & REALTIME SOUND CONTROL PANEL */}
          <div className="adm-section-card" style={{ border: '2px solid #CB202D', borderRadius: '20px', padding: '24px', marginBottom: '28px', background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <span className="admin-sub-tag" style={{ color: '#CB202D' }}>ADMIN ALERT ENGINE</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: '4px 0 0 0', color: 'var(--ink)' }}>
                  🔔 Order Notifications & Sound Controls
                </h3>
              </div>

              {/* Permission Status Pill */}
              <span style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 900,
                background: permissionStatus === 'granted' ? '#d1fae5' : (permissionStatus === 'denied' ? '#fee2e2' : '#fef3c7'),
                color: permissionStatus === 'granted' ? '#CB202D' : (permissionStatus === 'denied' ? '#dc2626' : '#b45309'),
              }}>
                {permissionStatus === 'granted' ? '🟢 PUSH PERMISSION GRANTED' : (permissionStatus === 'denied' ? '🔴 PUSH PERMISSION BLOCKED' : '🟡 NOTIFICATION NOT ENABLED YET')}
              </span>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--muted)', marginBottom: '20px', lineHeight: '1.5' }}>
              Receive instant Web Push notifications on Desktop & Mobile phone (Android Chrome) when an order is verified, plus loud realtime audio alerts when the admin dashboard is open.
            </p>

            {notifMessage && (
              <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#7A0A0A', fontWeight: 800, fontSize: '0.84rem', marginBottom: '18px' }}>
                {notifMessage}
              </div>
            )}

            {/* Push Setup Action Banner */}
            {permissionStatus !== 'granted' && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '16px', padding: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 900, color: '#166534' }}>
                    📱 Enable Order Push Notifications
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#15803d' }}>
                    Allow this device to receive order alerts even when the browser or admin tab is closed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEnablePushNotifications}
                  disabled={subscribing}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #CB202D 0%, #CB202D 100%)',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(180,74,52,0.3)'
                  }}
                >
                  {subscribing ? 'ENABLING...' : '🔔 ENABLE NOTIFICATIONS'}
                </button>
              </div>
            )}

            {/* Notification & Sound Toggles */}
            <div className="adm-grid-2" style={{ marginBottom: '20px' }}>
              {/* Push Checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '14px', border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => {
                    setPushEnabled(e.target.checked)
                    saveNotificationPreferences({ pushEnabled: e.target.checked })
                  }}
                  style={{ width: '18px', height: '18px', accentColor: '#CB202D' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1f2937' }}>Push Notifications</div>
                  <div style={{ fontSize: '0.76rem', color: '#6b7280' }}>Background alerts when browser is closed</div>
                </div>
              </label>

              {/* Sound Checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '14px', border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => {
                    setSoundEnabled(e.target.checked)
                    saveNotificationPreferences({ soundEnabled: e.target.checked })
                  }}
                  style={{ width: '18px', height: '18px', accentColor: '#CB202D' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1f2937' }}>New Order Sound</div>
                  <div style={{ fontSize: '0.76rem', color: '#6b7280' }}>Play loud alert sound on dashboard</div>
                </div>
              </label>
            </div>

            {/* Sound Theme & Volume Controls */}
            <div className="adm-grid-2" style={{ marginBottom: '20px' }}>
              {/* Sound Theme Dropdown */}
              <div className="adm-field">
                <label style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                  ALERT SOUND THEME
                </label>
                <select
                  value={soundTheme}
                  onChange={(e) => {
                    setSoundTheme(e.target.value)
                    saveNotificationPreferences({ soundTheme: e.target.value })
                  }}
                  className="adm-input"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '0.88rem' }}
                >
                  <option value="chime">🎵 Default New Order Chime</option>
                  <option value="siren">🚨 Kitchen Siren Alert</option>
                  <option value="bell">🔔 High Bell Ring</option>
                </select>
              </div>

              {/* Volume Slider */}
              <div className="adm-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                    ALERT VOLUME
                  </label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#CB202D' }}>
                    {soundVolume}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundVolume}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setSoundVolume(val)
                    saveNotificationPreferences({ soundVolume: val })
                  }}
                  style={{ width: '100%', accentColor: '#CB202D' }}
                />
              </div>
            </div>

            {/* Repeat Alert Toggle */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '14px', border: '1px solid #e5e7eb', background: '#ffffff', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={repeatAlert}
                  onChange={(e) => {
                    setRepeatAlert(e.target.checked)
                    saveNotificationPreferences({ repeatAlert: e.target.checked })
                  }}
                  style={{ width: '18px', height: '18px', accentColor: '#CB202D' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1f2937' }}>Repeat Alert Until Acknowledged</div>
                  <div style={{ fontSize: '0.76rem', color: '#6b7280' }}>Continuously repeat chime every 4s until admin taps Acknowledge</div>
                </div>
              </label>
            </div>

            {/* Test Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px dashed #e5e7eb' }}>
              <button
                type="button"
                onClick={handleTestPushNotification}
                disabled={testPushing}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1.5px solid #CB202D',
                  background: '#ffffff',
                  color: '#CB202D',
                  fontWeight: 900,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                {testPushing ? 'TESTING PUSH...' : '📲 TEST PUSH NOTIFICATION'}
              </button>
              <button
                type="button"
                onClick={handleTestOrderSound}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1.5px solid #CB202D',
                  background: '#ffffff',
                  color: '#CB202D',
                  fontWeight: 900,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                🔊 TEST ORDER SOUND
              </button>
              <button
                type="button"
                onClick={handleTestTelegramNotification}
                disabled={testTelegramming}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1.5px solid #2563eb',
                  background: '#ffffff',
                  color: '#2563eb',
                  fontWeight: 900,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                {testTelegramming ? 'TESTING TELEGRAM...' : '✈️ TEST TELEGRAM BOT'}
              </button>
            </div>
          </div>

          {/* GLOBAL ANNOUNCEMENT BANNER CONTROL PANEL */}
          <div className="adm-section-card" style={{ border: '2px solid var(--deep-green, #CB202D)', borderRadius: '20px', padding: '24px', marginBottom: '28px', background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <span className="admin-sub-tag" style={{ color: 'var(--deep-green, #CB202D)' }}>CUSTOMER BROWSER SYNC</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: '4px 0 0 0', color: 'var(--ink)' }}>
                  📢 Global Announcement Banner
                </h3>
              </div>

              {/* Master Enable/Disable Toggle */}
              <button
                type="button"
                onClick={() => setAnnouncementEnabled(!announcementEnabled)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '999px',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                  transition: 'all 0.2s ease',
                  background: announcementEnabled ? '#CB202D' : '#9ca3af',
                  color: '#ffffff',
                  boxShadow: announcementEnabled ? '0 4px 14px rgba(180,74,52,0.3)' : 'none'
                }}
              >
                {announcementEnabled ? '🟢 BANNER ACTIVE (ENABLED)' : '⚪ BANNER OFF (DISABLED)'}
              </button>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--muted)', marginBottom: '20px', lineHeight: '1.5' }}>
              Publish live announcement banners across customer pages (Homepage, Menu, Cart). Toggling OFF removes the banner instantly without leaving empty whitespace gaps.
            </p>

            {announcementError && (
              <div style={{ padding: '12px 16px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontWeight: 800, fontSize: '0.84rem', marginBottom: '18px' }}>
                {announcementError}
              </div>
            )}

            {/* Announcement Type Selection */}
            <div className="adm-field" style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                ANNOUNCEMENT TYPE & THEME
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                {[
                  { id: 'info', label: '📢 Info (Royal Teal)', bg: '#CB202D' },
                  { id: 'warning', label: '⚠️ Notice (Amber Flame)', bg: '#b45309' },
                  { id: 'success', label: '🎉 Offer (Emerald Green)', bg: '#CB202D' },
                  { id: 'urgent', label: '🚨 Urgent (Crimson Red)', bg: '#dc2626' }
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setAnnouncementType(type.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: announcementType === type.id ? '2px solid #000000' : '1px solid rgba(0,0,0,0.12)',
                      background: type.bg,
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      opacity: announcementType === type.id ? 1 : 0.7,
                      transform: announcementType === type.id ? 'scale(1.02)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Announcement Text Input */}
            <div className="adm-field" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                  ANNOUNCEMENT MESSAGE
                </label>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: announcementText.length > 5000 ? '#dc2626' : 'var(--muted)' }}>
                  {announcementText.length} / 5000 chars
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={5000}
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                placeholder="e.g. Store closes at 9 PM today for private catering | Free Delivery on orders above ₹399!"
                className="adm-input textarea"
                style={{ width: '100%', resize: 'vertical', fontSize: '0.92rem', padding: '12px' }}
              />
            </div>

            {/* Live Customer Preview */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed rgba(0,0,0,0.12)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--muted)', letterSpacing: '0.1em', display: 'block', marginBottom: '8px' }}>
                LIVE CUSTOMER BANNER PREVIEW:
              </span>
              {announcementEnabled && announcementText.trim() ? (
                <AnnouncementBanner
                  overrideSettings={{
                    announcementEnabled: true,
                    announcementText: announcementText.trim(),
                    announcementType
                  }}
                  placement="preview"
                />
              ) : (
                <div style={{ padding: '12px', textAlign: 'center', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '12px', color: '#6b7280', fontSize: '0.82rem', fontWeight: 600 }}>
                  Banner is currently OFF or empty. It will be hidden on customer pages without leaving empty space.
                </div>
              )}
            </div>
          </div>

          {/* MASTER STORE OPEN / CLOSED TOGGLE */}
          <div className="adm-section-card" style={{ padding: '24px', marginBottom: '24px', background: '#ffffff', borderRadius: '20px' }}>
            <div className={`store-toggle-box ${isStoreOpen ? 'open' : 'closed'}`}>
              <div className="store-toggle-info">
                <span className="toggle-tag">ONLINE ORDERING CONTROL</span>
                <h3>
                  {isStoreOpen ? '🟢 STORE IS OPEN — Accepting Online Orders' : '🔴 STORE IS CLOSED — Orders Suspended'}
                </h3>
                <p>
                  {isStoreOpen ? 'Customers can browse dishes and place orders normally.' : 'Customers CANNOT place orders. Checkout is locked.'}
                </p>
              </div>

              <button
                type="button"
                className={`btn store-toggle-btn ${isStoreOpen ? 'btn-close-store' : 'btn-open-store'}`}
                onClick={() => setIsStoreOpen(!isStoreOpen)}
              >
                {isStoreOpen ? 'CLOSE STORE NOW' : 'OPEN STORE NOW'}
              </button>
            </div>

            <div className="adm-grid-2" style={{ marginTop: '20px' }}>
              <div className="adm-field">
                <label>RESTAURANT DISPLAY NAME</label>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={e => setRestaurantName(e.target.value)}
                  className="adm-input"
                  required
                />
              </div>

              <div className="adm-field">
                <label>STORE UPI ID FOR PAYMENTS</label>
                <input
                  type="text"
                  value={storeUpiId}
                  onChange={e => setStoreUpiId(e.target.value)}
                  className="adm-input"
                  required
                />
              </div>
            </div>

            <div className="adm-grid-2">
              <div className="adm-field">
                <label>FLAT DELIVERY CHARGE (₹)</label>
                <input
                  type="number"
                  value={deliveryCharge}
                  onChange={e => setDeliveryCharge(e.target.value)}
                  className="adm-input"
                  required
                />
              </div>
              <div className="adm-field">
                <label>GST / TAX PERCENTAGE (%)</label>
                <input
                  type="number"
                  value={gstPercentage}
                  onChange={e => setGstPercentage(e.target.value)}
                  className="adm-input"
                  required
                />
              </div>
            </div>

            <div className="adm-grid-2">
              <div className="adm-field">
                <label>OPENING TIME</label>
                <input
                  type="text"
                  value={openingTime}
                  onChange={e => setOpeningTime(e.target.value)}
                  className="adm-input"
                  required
                />
              </div>
              <div className="adm-field">
                <label>CLOSING TIME</label>
                <input
                  type="text"
                  value={closingTime}
                  onChange={e => setClosingTime(e.target.value)}
                  className="adm-input"
                  required
                />
              </div>
            </div>

            <div className="adm-field">
              <label>SUPPORT PHONE NUMBER</label>
              <input
                type="text"
                value={supportPhone}
                onChange={e => setSupportPhone(e.target.value)}
                className="adm-input"
                required
              />
            </div>

            <div className="adm-field">
              <label>RESTAURANT ADDRESS</label>
              <textarea
                rows={3}
                value={restaurantAddress}
                onChange={e => setRestaurantAddress(e.target.value)}
                className="adm-input textarea"
                required
              />
            </div>

            <button
              type="submit"
              className="btn adm-btn-submit"
              disabled={saving}
              style={{ marginTop: '12px' }}
            >
              {saving ? 'SAVING ALL SETTINGS & ANNOUNCEMENTS...' : 'SAVE ALL SETTINGS & PUBLISH ANNOUNCEMENT'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
