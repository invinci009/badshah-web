import dynamic from 'next/dynamic'

const AnnouncementBanner = dynamic(() => import('./AnnouncementBanner'), { ssr: false })

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems = [],
  cartTotal = 0,
  updateCartQty,
  removeFromCart,
  onProceedToCheckout
}) {
  const totalItemCount = cartItems.reduce((sum, item) => sum + (item.qty || 0), 0)
  const freeDeliveryThreshold = 499
  const amountToFreeDelivery = Math.max(0, freeDeliveryThreshold - cartTotal)
  const progressPercent = Math.min(100, Math.round((cartTotal / freeDeliveryThreshold) * 100))

  return (
    <>
      <aside
        className={`cart-drawer-v2 ${isOpen ? 'open' : ''}`}
        aria-label="Shopping cart"
        aria-hidden={isOpen ? 'false' : 'true'}
      >
        {/* Top Header */}
        <div className="cd-header">
          <div className="cd-header-content">
            <div className="cd-title-wrap">
              <span className="cd-badge">
                <span className="cd-badge-pulse" />
                YOUR SELECTION ({totalItemCount})
              </span>
              <h2 className="cd-title">Your Food Basket 🍲</h2>
            </div>
            <button type="button" className="cd-close-btn" aria-label="Close cart" onClick={onClose}>
              ✕
            </button>
          </div>

          {/* Free Delivery Target Progress Bar */}
          {cartItems.length > 0 && (
            <div className="cd-progress-card">
              <div className="cd-progress-info">
                {amountToFreeDelivery > 0 ? (
                  <span>Add <strong>₹{amountToFreeDelivery}</strong> more for <strong>FREE Delivery 🎉</strong></span>
                ) : (
                  <span className="cd-free-unlocked">🎉 Congratulations! You unlocked <strong>FREE Delivery!</strong></span>
                )}
                <span className="cd-progress-pct">{progressPercent}%</span>
              </div>
              <div className="cd-progress-track">
                <div className="cd-progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="cd-body">
          <AnnouncementBanner placement="cart" />

          {cartItems.length === 0 ? (
            <div className="cd-empty-state">
              <div className="cd-empty-illustration">
                <span className="cd-empty-emoji">🍛</span>
              </div>
              <h3 className="cd-empty-title">Your basket is empty</h3>
              <p className="cd-empty-sub">Explore our authentic Dum Biryani & starters to start your feast.</p>
              <button type="button" onClick={onClose} className="cd-empty-btn">
                Browse Menu →
              </button>
            </div>
          ) : (
            <div className="cd-items-list">
              {cartItems.map((item) => (
                <div className="cd-item-card" key={item.title}>
                  <div className="cd-item-thumb-wrap">
                    <img loading="lazy" decoding="async"  src={item.image} alt={item.title} className="cd-item-thumb" />
                  </div>
                  <div className="cd-item-details">
                    <h4 className="cd-item-name">{item.title}</h4>
                    <span className="cd-item-price">₹{(item.price || 0).toFixed(0)}</span>

                    <div className="cd-item-controls">
                      <div className="cd-stepper">
                        <button
                          type="button"
                          className="cd-step-btn"
                          onClick={() => updateCartQty(item.title, -1)}
                          aria-label={`Decrease ${item.title}`}
                        >
                          −
                        </button>
                        <span className="cd-step-qty">{item.qty}</span>
                        <button
                          type="button"
                          className="cd-step-btn"
                          onClick={() => updateCartQty(item.title, 1)}
                          aria-label={`Increase ${item.title}`}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        className="cd-remove-btn"
                        onClick={() => removeFromCart(item.title)}
                        aria-label={`Remove ${item.title}`}
                      >
                        🗑️ Remove
                      </button>
                    </div>
                  </div>

                  <div className="cd-item-subtotal">
                    ₹{((item.price || 0) * item.qty).toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        {cartItems.length > 0 && (
          <div className="cd-footer">
            <div className="cd-bill-summary">
              <div className="cd-bill-row">
                <span>Items Subtotal</span>
                <strong>₹{cartTotal.toFixed(0)}</strong>
              </div>
              <div className="cd-bill-row small">
                <span>Estimated Delivery</span>
                <span>{amountToFreeDelivery === 0 ? <strong style={{ color: '#16a34a' }}>FREE</strong> : 'Calculated at checkout'}</span>
              </div>
            </div>

            <button
              type="button"
              className="cd-checkout-btn"
              onClick={onProceedToCheckout}
              disabled={cartItems.length === 0}
            >
              <span>Proceed to Checkout</span>
              <strong className="cd-btn-price">₹{cartTotal.toFixed(0)} →</strong>
            </button>
          </div>
        )}
      </aside>

      {isOpen ? (
        <div
          className={`cart-backdrop-v2 ${isOpen ? 'open' : ''}`}
          aria-label="Close cart overlay"
          onClick={onClose}
        />
      ) : null}
    </>
  )
}
