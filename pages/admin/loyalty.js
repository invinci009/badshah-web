import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { useAuth } from '../../context/AuthContext'

export default function AdminLoyaltyDesk() {
  const { user, isAdmin, accessToken } = useAuth()
  const [activeTab, setActiveTab] = useState('rules') // rules, rewards, customers, redemptions, analytics

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // Data states
  const [config, setConfig] = useState({
    enabled: true,
    pointsPerOrder: 20,
    minOrder: 0,
    expiryEnabled: false,
    expiryDays: 365,
    maxRedemptionsPerOrder: 1,
    refundPolicy: 'REVERSE',
  })
  const [rewards, setRewards] = useState([])
  const [customers, setCustomers] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [analytics, setAnalytics] = useState(null)

  // Search & filter states
  const [customerSearch, setCustomerSearch] = useState('')
  const [redemptionStatusFilter, setRedemptionStatusFilter] = useState('all')

  // Modals
  const [rewardModalOpen, setRewardModalOpen] = useState(false)
  const [editingReward, setEditingReward] = useState(null)
  const [rewardForm, setRewardForm] = useState({
    name: '',
    description: '',
    type: 'FIXED_DISCOUNT',
    pointsCost: 100,
    discountValue: 50,
    discountMax: 0,
    minOrder: 249,
    imageUrl: '',
    stock: '',
    active: true,
  })

  const [adjustModalOpen, setAdjustModalOpen] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustDelta, setAdjustDelta] = useState(20)
  const [adjustReason, setAdjustReason] = useState('')

  const flash = (ok, msg) => {
    setFeedback({ ok, msg })
    setTimeout(() => setFeedback(null), 4500)
  }

  // Load all loyalty data
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}

      const [cfgRes, rwRes, custRes, redRes, anRes] = await Promise.all([
        fetch('/api/admin/loyalty/config', { headers }),
        fetch('/api/admin/loyalty/rewards', { headers }),
        fetch('/api/admin/loyalty/customers', { headers }),
        fetch('/api/admin/loyalty/redemptions', { headers }),
        fetch('/api/admin/loyalty/analytics', { headers }),
      ])

      if (cfgRes.ok) setConfig(await cfgRes.json())
      if (rwRes.ok) setRewards(await rwRes.json())
      if (custRes.ok) setCustomers(await custRes.json())
      if (redRes.ok) setRedemptions(await redRes.json())
      if (anRes.ok) setAnalytics(await anRes.json())
    } catch (err) {
      flash(false, 'Failed to load loyalty data: ' + err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Save Config
  const handleSaveConfig = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      }
      const res = await fetch('/api/admin/loyalty/config', {
        method: 'POST',
        headers,
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error('Save failed')
      flash(true, '🎉 Loyalty program rules saved successfully!')
      loadData(true)
    } catch (err) {
      flash(false, err.message)
    } finally {
      setSaving(false)
    }
  }

  // Save / Upsert Reward
  const handleSaveReward = async (e) => {
    e.preventDefault()
    if (!rewardForm.name.trim() || !rewardForm.pointsCost) return
    setSaving(true)
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      }
      const payload = {
        ...rewardForm,
        id: editingReward ? editingReward.id : undefined,
        pointsCost: Number(rewardForm.pointsCost),
        discountValue: Number(rewardForm.discountValue || 0),
        discountMax: Number(rewardForm.discountMax || 0),
        minOrder: Number(rewardForm.minOrder || 0),
        stock: rewardForm.stock ? Number(rewardForm.stock) : null,
      }
      const res = await fetch('/api/admin/loyalty/rewards', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save reward')
      flash(true, editingReward ? 'Reward updated!' : 'New reward perk added!')
      setRewardModalOpen(false)
      setEditingReward(null)
      loadData(true)
    } catch (err) {
      flash(false, err.message)
    } finally {
      setSaving(false)
    }
  }

  // Toggle Reward Active Status
  const handleToggleRewardActive = async (reward) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      }
      await fetch('/api/admin/loyalty/rewards', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...reward, active: !reward.active }),
      })
      flash(true, `Reward "${reward.name}" is now ${!reward.active ? 'Active' : 'Inactive'}`)
      loadData(true)
    } catch (e) {
      flash(false, 'Failed to toggle reward active status')
    }
  }

  // Delete Reward
  const handleDeleteReward = async (id, name) => {
    if (!confirm(`Are you sure you want to delete reward "${name}"?`)) return
    try {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
      const res = await fetch(`/api/admin/loyalty/rewards?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      })
      if (res.ok) {
        flash(true, 'Reward deleted successfully')
        loadData(true)
      }
    } catch (e) {
      flash(false, 'Failed to delete reward')
    }
  }

  // Submit Point Adjustment
  const handleAdjustPointsSubmit = async (e) => {
    e.preventDefault()
    if (!adjustTarget || !adjustDelta || !adjustReason.trim()) return
    setSaving(true)
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      }
      const res = await fetch('/api/admin/loyalty/adjust', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: adjustTarget.customerId || adjustTarget.phone,
          delta: Number(adjustDelta),
          reason: adjustReason.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Adjustment failed')
      flash(true, data.message || 'Points adjusted successfully!')
      setAdjustModalOpen(false)
      setAdjustTarget(null)
      setAdjustReason('')
      loadData(true)
    } catch (err) {
      flash(false, err.message)
    } finally {
      setSaving(false)
    }
  }

  // Cancel & Restore Redemption
  const handleCancelRedemption = async (redemption) => {
    if (!confirm(`Cancel redemption for ${redemption.customerName} and restore ${redemption.pointsUsed} points?`)) return
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      }
      const res = await fetch('/api/admin/loyalty/redemptions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          redemptionId: redemption.id,
          action: 'CANCEL_RESTORE',
          reason: 'Cancelled and points refunded by Admin',
        }),
      })
      if (res.ok) {
        flash(true, `Restored ${redemption.pointsUsed} points to ${redemption.customerPhone}`)
        loadData(true)
      }
    } catch (e) {
      flash(false, 'Failed to cancel redemption')
    }
  }

  // Filtered customer accounts
  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch) return true
    const q = customerSearch.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.customerId || '').toLowerCase().includes(q)
    )
  })

  // Filtered redemptions
  const filteredRedemptions = redemptions.filter((r) => {
    if (redemptionStatusFilter === 'all') return true
    return (r.status || '').toLowerCase() === redemptionStatusFilter.toLowerCase()
  })

  const tabs = [
    { key: 'rules', label: 'Program Rules', icon: '⚙️' },
    { key: 'rewards', label: `Rewards (${rewards.length})`, icon: '🎁' },
    { key: 'customers', label: `Customers (${customers.length})`, icon: '👥' },
    { key: 'redemptions', label: `Redemptions (${redemptions.length})`, icon: '🛍️' },
    { key: 'analytics', label: 'Analytics', icon: '📊' },
  ]

  return (
    <AdminLayout activePage="loyalty" title="VIP Club & Points Engine">
      <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
        {/* Top Header Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #7A0210 0%, #9E0C1F 60%, #4A000A 100%)',
            color: '#FFFFFF',
            borderRadius: '24px',
            padding: '24px 32px',
            marginBottom: '24px',
            boxShadow: '0 10px 30px rgba(122, 2, 16, 0.25)',
            border: '1px solid rgba(245, 197, 24, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1.4rem' }}>👑</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#FDE047', textTransform: 'uppercase' }}>
                BADSHAH ONLINE VIP CLUB (WEBSITE ONLY • SEPARATE FROM QR ORDERING)
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#FFFFFF' }}>
              Website VIP Loyalty Desk
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#FCE7F3', opacity: 0.9 }}>
              Dedicated website loyalty engine (`web_loyalty_accounts`). Governs online delivery &amp; takeaway points independently from dine-in QR tables.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={loading}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#FFFFFF',
                padding: '10px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>

            <a
              href="/loyalty"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#FDE047',
                color: '#7A0210',
                padding: '10px 18px',
                borderRadius: '12px',
                fontWeight: 900,
                fontSize: '0.82rem',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>View Diner Portal</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            style={{
              padding: '12px 20px',
              borderRadius: '14px',
              marginBottom: '20px',
              fontWeight: 800,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: feedback.ok ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
              color: feedback.ok ? '#15803D' : '#DC2626',
              border: `1px solid ${feedback.ok ? 'rgba(22, 163, 74, 0.25)' : 'rgba(220, 38, 38, 0.25)'}`,
            }}
          >
            <span>{feedback.ok ? '✓' : '⚠️'}</span>
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Status Warning if Disabled */}
        {!config.enabled && (
          <div
            style={{
              padding: '12px 20px',
              borderRadius: '14px',
              marginBottom: '20px',
              fontWeight: 800,
              fontSize: '0.85rem',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#B45309',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>
              The Badshah Loyalty Program is currently <strong>PAUSED</strong>. Diners cannot earn new points or redeem rewards until re-enabled.
            </span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '24px',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
            paddingBottom: '12px',
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '14px',
                fontWeight: 800,
                fontSize: '0.85rem',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === t.key ? 'var(--deep-green)' : '#FFFFFF',
                color: activeTab === t.key ? '#FFFFFF' : 'var(--muted)',
                boxShadow: activeTab === t.key ? '0 4px 14px rgba(203, 32, 45, 0.2)' : '0 2px 6px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB 1: RULES & POLICY ── */}
        {activeTab === 'rules' && (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              padding: '32px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
              ⚙️ Program Rules &amp; Earning Engine
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
              Configure how customers accrue and retain Badshah VIP points.
            </p>

            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* Program Enabled Switch */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderRadius: '16px',
                  background: config.enabled ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)',
                  border: `1px solid ${config.enabled ? 'rgba(22, 163, 74, 0.25)' : 'rgba(220, 38, 38, 0.25)'}`,
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: 'var(--ink)' }}>
                    Program Active Status
                  </h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {config.enabled ? 'Active — Diners earn and redeem VIP points' : 'Paused — Points features hidden from diners'}
                  </p>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--deep-green)' }}
                  />
                  <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{config.enabled ? 'ENABLED' : 'PAUSED'}</span>
                </label>
              </div>

              {/* Grid of Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: 'var(--ink)', marginBottom: '6px' }}>
                    Points Earned Per Completed Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.pointsPerOrder}
                    onChange={(e) => setConfig({ ...config, pointsPerOrder: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      height: '46px',
                      padding: '0 14px',
                      borderRadius: '12px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                    Default: 20 points awarded upon delivery of each eligible meal.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: 'var(--ink)', marginBottom: '6px' }}>
                    Minimum Order Subtotal (₹) to Earn Points
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.minOrder}
                    onChange={(e) => setConfig({ ...config, minOrder: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      height: '46px',
                      padding: '0 14px',
                      borderRadius: '12px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                    Set to 0 to qualify every order regardless of bill size.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: 'var(--ink)', marginBottom: '6px' }}>
                    Points Expiry Policy
                  </label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', height: '46px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={config.expiryEnabled}
                        onChange={(e) => setConfig({ ...config, expiryEnabled: e.target.checked })}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--deep-green)' }}
                      />
                      <span>Enable Point Expiry</span>
                    </label>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>
                    If disabled, earned points remain in diner balances indefinitely.
                  </span>
                </div>

                {config.expiryEnabled && (
                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: 'var(--ink)', marginBottom: '6px' }}>
                      Expiry Window (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={config.expiryDays}
                      onChange={(e) => setConfig({ ...config, expiryDays: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        height: '46px',
                        padding: '0 14px',
                        borderRadius: '12px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        fontSize: '0.9rem',
                        fontWeight: 800,
                      }}
                    />
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                      Points expire X days after being earned (FIFO sweep).
                    </span>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: 'var(--ink)', marginBottom: '6px' }}>
                    Order Refund &amp; Cancellation Policy
                  </label>
                  <select
                    value={config.refundPolicy}
                    onChange={(e) => setConfig({ ...config, refundPolicy: e.target.value })}
                    style={{
                      width: '100%',
                      height: '46px',
                      padding: '0 14px',
                      borderRadius: '12px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      background: '#FFFFFF',
                    }}
                  >
                    <option value="REVERSE">REVERSE — Clawback earned points upon cancellation</option>
                    <option value="KEEP">KEEP — Diner retains awarded points</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: 'var(--ink)', marginBottom: '6px' }}>
                    Max Rewards Redeemable Per Order
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={config.maxRedemptionsPerOrder}
                    onChange={(e) => setConfig({ ...config, maxRedemptionsPerOrder: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      height: '46px',
                      padding: '0 14px',
                      borderRadius: '12px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                    }}
                  />
                </div>
              </div>

              <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '12px 28px',
                    borderRadius: '14px',
                    background: 'var(--deep-green)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(203, 32, 45, 0.25)',
                  }}
                >
                  {saving ? 'Saving Rules...' : 'Save Loyalty Program Rules'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── TAB 2: REWARDS CATALOG ── */}
        {activeTab === 'rewards' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
                  🎁 Loyalty Rewards Catalog ({rewards.length})
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Perks, discount vouchers, and complimentary food items redeemable with points.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingReward(null)
                  setRewardForm({
                    name: '',
                    description: '',
                    type: 'FIXED_DISCOUNT',
                    pointsCost: 100,
                    discountValue: 50,
                    discountMax: 0,
                    minOrder: 249,
                    imageUrl: '',
                    stock: '',
                    active: true,
                  })
                  setRewardModalOpen(true)
                }}
                style={{
                  background: 'var(--deep-green)',
                  color: '#FFFFFF',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(203, 32, 45, 0.25)',
                }}
              >
                <span>+</span>
                <span>Add New Reward</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {rewards.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    padding: '20px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    opacity: r.active ? 1 : 0.65,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 900,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: r.active ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                          color: r.active ? '#15803D' : '#DC2626',
                          display: 'inline-block',
                          marginBottom: '6px',
                        }}
                      >
                        {r.active ? 'ACTIVE' : 'INACTIVE'} • {(r.type || 'TOP_UP').replace('_', ' ')}
                      </span>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: 'var(--ink)' }}>
                        {r.name}
                      </h4>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--deep-green)' }}>
                        🪙 {r.pointsCost}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)' }}>
                        POINTS
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                    {r.description || 'No description provided.'}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink)', padding: '10px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <span>
                      Discount:{' '}
                      <strong>
                        {r.type === 'PERCENT_DISCOUNT' ? `${r.discountValue}%` : `₹${r.discountValue}`}
                        {r.discountMax ? ` (Max ₹${r.discountMax})` : ''}
                      </strong>
                    </span>
                    <span>Min Order: <strong>₹{r.minOrder || 0}</strong></span>
                    <span>Stock: <strong>{r.stock !== null ? r.stock : 'Unlimited'}</strong></span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleRewardActive(r)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: '1px solid rgba(0,0,0,0.12)',
                        background: '#FFFFFF',
                        cursor: 'pointer',
                      }}
                    >
                      {r.active ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingReward(r)
                        setRewardForm({
                          name: r.name,
                          description: r.description || '',
                          type: r.type,
                          pointsCost: r.pointsCost,
                          discountValue: r.discountValue || 0,
                          discountMax: r.discountMax || 0,
                          minOrder: r.minOrder || 0,
                          imageUrl: r.imageUrl || '',
                          stock: r.stock !== null ? String(r.stock) : '',
                          active: r.active !== false,
                        })
                        setRewardModalOpen(true)
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: '1px solid rgba(203, 32, 45, 0.25)',
                        background: 'rgba(203, 32, 45, 0.08)',
                        color: 'var(--deep-green)',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteReward(r.id, r.name)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '10px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: '1px solid rgba(220, 38, 38, 0.25)',
                        background: 'rgba(220, 38, 38, 0.08)',
                        color: '#DC2626',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: CUSTOMER ACCOUNTS & ADJUSTMENTS ── */}
        {activeTab === 'customers' && (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              padding: '28px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
                  👥 Enrolled VIP Diners ({customers.length})
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Search customer balances, audit point history, and issue manual adjustments.
                </p>
              </div>

              <div style={{ width: '280px' }}>
                <input
                  type="text"
                  placeholder="Search by phone, name, email..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.15)',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 14px' }}>Diner Name / ID</th>
                    <th style={{ padding: '12px 14px' }}>Mobile</th>
                    <th style={{ padding: '12px 14px' }}>VIP Tier</th>
                    <th style={{ padding: '12px 14px' }}>Available Pts</th>
                    <th style={{ padding: '12px 14px' }}>Earned Total</th>
                    <th style={{ padding: '12px 14px' }}>Redeemed</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                        No enrolled VIP accounts found matching search.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--ink)' }}>
                          <div>{c.name}</div>
                          {c.email && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>{c.email}</span>}
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700 }}>
                          {c.phone ? `+91 ${c.phone}` : '-'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              background: 'rgba(245, 197, 24, 0.15)',
                              color: '#92400E',
                              border: '1px solid rgba(245, 197, 24, 0.4)',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 900,
                            }}
                          >
                            {c.tierBadge} {c.tier}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 900, color: 'var(--deep-green)', fontSize: '1rem' }}>
                          {c.availablePoints}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--muted)' }}>
                          {c.earnedTotal} pts
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--muted)' }}>
                          {c.redeemedTotal} pts
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustTarget(c)
                              setAdjustDelta(20)
                              setAdjustReason('')
                              setAdjustModalOpen(true)
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              background: 'rgba(203, 32, 45, 0.08)',
                              color: 'var(--deep-green)',
                              border: '1px solid rgba(203, 32, 45, 0.25)',
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Adjust Pts
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 4: REDEMPTIONS ── */}
        {activeTab === 'redemptions' && (
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              padding: '28px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
                  🛍️ Loyalty Perk Redemptions ({redemptions.length})
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Log of rewards applied to orders and their fulfilment status.
                </p>
              </div>

              {/* Status pills */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {['all', 'applied', 'fulfilled', 'cancelled'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setRedemptionStatusFilter(st)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      border: '1px solid rgba(0,0,0,0.08)',
                      background: redemptionStatusFilter === st ? 'var(--deep-green)' : '#FFFFFF',
                      color: redemptionStatusFilter === st ? '#FFFFFF' : 'var(--muted)',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 14px' }}>Redemption ID</th>
                    <th style={{ padding: '12px 14px' }}>Diner Mobile</th>
                    <th style={{ padding: '12px 14px' }}>Reward Perk</th>
                    <th style={{ padding: '12px 14px' }}>Pts Spent</th>
                    <th style={{ padding: '12px 14px' }}>Discount (₹)</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRedemptions.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                        No redemptions logged yet.
                      </td>
                    </tr>
                  ) : (
                    filteredRedemptions.map((r) => {
                      const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : '-'

                      const isApplied = r.status === 'APPLIED'

                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.78rem' }}>
                            {r.id}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                            {r.customerPhone ? `+91 ${r.customerPhone}` : r.customerId}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--ink)' }}>
                            {r.rewardName}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 900, color: '#DC2626' }}>
                            -{r.pointsUsed} pts
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 800, color: '#15803D' }}>
                            ₹{r.discountAmount}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 900,
                                background:
                                  r.status === 'FULFILLED'
                                    ? 'rgba(22, 163, 74, 0.1)'
                                    : r.status === 'APPLIED'
                                    ? 'rgba(245, 158, 11, 0.12)'
                                    : 'rgba(220, 38, 38, 0.1)',
                                color:
                                  r.status === 'FULFILLED'
                                    ? '#15803D'
                                    : r.status === 'APPLIED'
                                    ? '#B45309'
                                    : '#DC2626',
                              }}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '0.75rem', color: 'var(--muted)' }}>
                            {dateStr}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {isApplied && (
                              <button
                                type="button"
                                onClick={() => handleCancelRedemption(r)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  background: 'rgba(220, 38, 38, 0.08)',
                                  color: '#DC2626',
                                  border: '1px solid rgba(220, 38, 38, 0.25)',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel &amp; Refund Pts
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 5: ANALYTICS & INSIGHTS ── */}
        {activeTab === 'analytics' && analytics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* KPI Cards Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '20px',
                  padding: '20px',
                  border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  ENROLLED VIP MEMBERS
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--ink)', margin: '6px 0 2px 0' }}>
                  {analytics.enrolledMembers}
                </div>
                <span style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 800 }}>
                  Active loyalty participants
                </span>
              </div>

              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '20px',
                  padding: '20px',
                  border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  POINTS ISSUED
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--deep-green)', margin: '6px 0 2px 0' }}>
                  +{analytics.pointsIssued}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>
                  Lifetime awarded for feasts
                </span>
              </div>

              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '20px',
                  padding: '20px',
                  border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  POINTS REDEEMED
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#D97706', margin: '6px 0 2px 0' }}>
                  {analytics.pointsRedeemed}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>
                  Converted into meal discounts
                </span>
              </div>

              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '20px',
                  padding: '20px',
                  border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  OUTSTANDING LIABILITY
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#2563EB', margin: '6px 0 2px 0' }}>
                  {analytics.pointsOutstanding}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>
                  Unspent points in diner wallets
                </span>
              </div>

              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: '20px',
                  padding: '20px',
                  border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  REPEAT DINERS (2+ MEALS)
                </span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#7C3AED', margin: '6px 0 2px 0' }}>
                  {analytics.repeatDiners}
                </div>
                <span style={{ fontSize: '0.72rem', color: '#7C3AED', fontWeight: 800 }}>
                  High-loyalty regular customers
                </span>
              </div>
            </div>

            {/* Popular Rewards Leaderboard */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                padding: '28px',
                border: '1px solid rgba(0,0,0,0.06)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              }}
            >
              <h4 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 900, color: 'var(--ink)' }}>
                🏆 Top Redeemed Rewards &amp; Delicacies
              </h4>

              {(!analytics.popularRewards || analytics.popularRewards.length === 0) ? (
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
                  No reward redemptions logged yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {analytics.popularRewards.map((pr, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        borderRadius: '16px',
                        background: '#FAF7F2',
                        border: '1px solid rgba(0,0,0,0.04)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--deep-green)' }}>
                          #{idx + 1}
                        </span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 900, fontSize: '0.9rem', color: 'var(--ink)' }}>
                            {pr.name}
                          </p>
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                            {pr.count} redemptions logged
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 900, color: '#D97706', fontSize: '0.95rem' }}>
                          🪙 {pr.pointsSpent} pts
                        </span>
                        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--muted)' }}>
                          consumed
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MODAL: ADD / EDIT REWARD ── */}
        {rewardModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 3000,
              display: 'grid',
              placeItems: 'center',
              padding: '16px',
            }}
          >
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                padding: '28px',
                maxWidth: '520px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setRewardModalOpen(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                }}
              >
                ×
              </button>

              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
                {editingReward ? 'Edit Reward Perk' : 'Create New Loyalty Reward'}
              </h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                Set up a reward that diners can unlock with their points.
              </p>

              <form onSubmit={handleSaveReward} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                    Reward Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ₹50 Royal Privilege Off"
                    value={rewardForm.name}
                    onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Instant ₹50 deduction on your Dum Pukht meal"
                    value={rewardForm.description}
                    onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                      Reward Type *
                    </label>
                    <select
                      value={rewardForm.type}
                      onChange={(e) => setRewardForm({ ...rewardForm, type: e.target.value })}
                      style={{
                        width: '100%',
                        height: '42px',
                        padding: '0 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        background: '#FFFFFF',
                      }}
                    >
                      <option value="FIXED_DISCOUNT">Fixed ₹ Discount</option>
                      <option value="PERCENT_DISCOUNT">Percentage (%) Discount</option>
                      <option value="FREE_ITEM">Free Complimentary Dish</option>
                      <option value="CUSTOM">Custom VIP Perk</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                      Points Cost *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="100"
                      value={rewardForm.pointsCost}
                      onChange={(e) => setRewardForm({ ...rewardForm, pointsCost: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        height: '42px',
                        padding: '0 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                      {rewardForm.type === 'PERCENT_DISCOUNT' ? 'Discount Percentage (%)' : 'Discount Value (₹)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="50"
                      value={rewardForm.discountValue}
                      onChange={(e) => setRewardForm({ ...rewardForm, discountValue: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        height: '42px',
                        padding: '0 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                      Minimum Order (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="249"
                      value={rewardForm.minOrder}
                      onChange={(e) => setRewardForm({ ...rewardForm, minOrder: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        height: '42px',
                        padding: '0 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                </div>

                {rewardForm.type === 'PERCENT_DISCOUNT' && (
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                      Max Discount Cap (₹) - 0 for uncapped
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="150"
                      value={rewardForm.discountMax}
                      onChange={(e) => setRewardForm({ ...rewardForm, discountMax: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        height: '42px',
                        padding: '0 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                    Dish / Perk Image URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={rewardForm.imageUrl}
                    onChange={(e) => setRewardForm({ ...rewardForm, imageUrl: e.target.value })}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                      Stock Quantity (Empty for Unlimited)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Unlimited"
                      value={rewardForm.stock}
                      onChange={(e) => setRewardForm({ ...rewardForm, stock: e.target.value })}
                      style={{
                        width: '100%',
                        height: '42px',
                        padding: '0 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem' }}>
                      <input
                        type="checkbox"
                        checked={rewardForm.active}
                        onChange={(e) => setRewardForm({ ...rewardForm, active: e.target.checked })}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--deep-green)' }}
                      />
                      <span>Active in Catalog</span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    height: '46px',
                    borderRadius: '12px',
                    background: 'var(--deep-green)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    marginTop: '8px',
                  }}
                >
                  {saving ? 'Saving...' : editingReward ? 'Update Reward Perk' : 'Create Reward Perk'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: ADJUST POINTS ── */}
        {adjustModalOpen && adjustTarget && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 3000,
              display: 'grid',
              placeItems: 'center',
              padding: '16px',
            }}
          >
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                padding: '28px',
                maxWidth: '440px',
                width: '100%',
                boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                }}
              >
                ×
              </button>

              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900, color: 'var(--ink)' }}>
                Manual Point Adjustment
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                Adjusting balance for <strong>{adjustTarget.name}</strong> (+91 {adjustTarget.phone})
              </p>

              <div
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  background: '#FAF7F2',
                  border: '1px solid rgba(0,0,0,0.06)',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)' }}>Current Balance:</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--deep-green)' }}>
                  {adjustTarget.availablePoints} pts
                </span>
              </div>

              <form onSubmit={handleAdjustPointsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                    Adjustment Delta (+credit / -debit) *
                  </label>
                  <input
                    type="number"
                    required
                    value={adjustDelta}
                    onChange={(e) => setAdjustDelta(Number(e.target.value))}
                    placeholder="+20 or -50"
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.95rem',
                      fontWeight: 900,
                      color: adjustDelta >= 0 ? '#15803D' : '#DC2626',
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                    New estimated balance: {Math.max(0, (adjustTarget.availablePoints || 0) + Number(adjustDelta))} pts
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                    Reason for Adjustment (Mandatory Audit Trail) *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    placeholder="e.g. Compensation for delivery delay, VIP gift"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    height: '46px',
                    borderRadius: '12px',
                    background: 'var(--deep-green)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    marginTop: '8px',
                  }}
                >
                  {saving ? 'Processing...' : 'Apply Points Adjustment'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
