import { useSettings } from '../context/SettingsContext'

const TYPE_CONFIG = {
  info: {
    icon: '📢',
    label: 'ANNOUNCEMENT',
    bgClass: 'banner-type-info'
  },
  warning: {
    icon: '⚠️',
    label: 'NOTICE',
    bgClass: 'banner-type-warning'
  },
  success: {
    icon: '🎉',
    label: 'SPECIAL OFFER',
    bgClass: 'banner-type-success'
  },
  urgent: {
    icon: '🚨',
    label: 'URGENT UPDATE',
    bgClass: 'banner-type-urgent'
  }
}

export default function AnnouncementBanner({ overrideSettings = null, placement = 'global', className = '' }) {
  const { settings } = useSettings()
  
  const activeSettings = overrideSettings || settings
  const isEnabled = Boolean(activeSettings?.announcementEnabled)
  const text = (activeSettings?.announcementText || '').trim()
  const type = activeSettings?.announcementType || 'info'
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info

  // Zero layout shift: return null when disabled or text is empty
  if (!isEnabled || !text) {
    return null
  }

  return (
    <div
      className={`global-announcement-banner ${config.bgClass} placement-${placement} ${className}`}
      role="region"
      aria-label="Global Announcement"
    >
      <div className="announcement-inner container">
        <div className="announcement-badge">
          <span className="announcement-icon" aria-hidden="true">{config.icon}</span>
          <span className="announcement-label">{config.label}</span>
        </div>
        
        {/* Render text safely as a standard React string node to prevent HTML injection / XSS */}
        <div className="announcement-text">
          {text}
        </div>
      </div>
    </div>
  )
}
