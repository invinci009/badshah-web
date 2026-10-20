import Link from 'next/link'
import { useAuth } from '../context/AuthContext'

export default function MobileBottomBar({ activeTab = 'home', cartCount = 0, onOpenCart }) {
  const { user, isAdmin, openAuthModal } = useAuth()

  return (
    <div className="mobile-bottom-bar">
      <nav aria-label="Mobile Bottom Navigation">
        <Link href="/" className={activeTab === 'home' ? 'active' : ''}>
          <span className="tab-icon">🏠</span>
          Home
        </Link>
        <Link href="/menu" className={activeTab === 'menu' ? 'active' : ''}>
          <span className="tab-icon">🍛</span>
          Menu
        </Link>
        <button
          type="button"
          onClick={onOpenCart}
          className={activeTab === 'cart' ? 'active' : ''}
          style={{ position: 'relative' }}
          aria-label={`Shopping cart with ${cartCount} items`}
        >
          <span className="tab-icon">🛒</span>
          Cart
          {cartCount > 0 && <span className="cart-tab-badge">{cartCount}</span>}
        </button>
        <Link href="/my-orders" className={activeTab === 'orders' ? 'active' : ''}>
          <span className="tab-icon">📦</span>
          Orders
        </Link>
        {user && isAdmin && (
          <Link href="/admin" className={activeTab === 'admin' ? 'active' : ''} style={{ color: 'var(--deep-green)', fontWeight: 800 }}>
            <span className="tab-icon">🛡️</span>
            Admin
          </Link>
        )}
        {user ? (
          <Link href="/profile" className={activeTab === 'profile' ? 'active' : ''}>
            <span className="tab-icon">👤</span>
            Profile
          </Link>
        ) : (
          <button type="button" onClick={openAuthModal}>
            <span className="tab-icon">🔐</span>
            Sign In
          </button>
        )}
      </nav>
    </div>
  )
}
