import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import AdminLayout from '../../components/AdminLayout'
import { ALL_MENU_ITEMS } from '../../data/menuData'

export default function AdminMenuDesk() {
  const { user, isAdmin } = useAuth()
  const [menuItems, setMenuItems] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  // Form State
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('kawab')
  const [image, setImage] = useState('')
  const [vegNonVeg, setVegNonVeg] = useState('non-veg')
  const [preparationTime, setPreparationTime] = useState('20-25 mins')
  const [spice, setSpice] = useState('Medium')
  const [available, setAvailable] = useState(true)
  const [popular, setPopular] = useState(false)
  
  // Image Upload State
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    setUploading(true)
    setUploadProgress(20)

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        // Create canvas and resize image
        const canvas = document.createElement('canvas')
        const MAX_WIDTH = 600
        const scaleSize = MAX_WIDTH / img.width
        canvas.width = MAX_WIDTH
        canvas.height = img.height * scaleSize

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        
        // Convert to WebP base64
        const dataUrl = canvas.toDataURL('image/webp', 0.8)
        
        setImage(dataUrl)
        setUploadProgress(100)
        setTimeout(() => setUploading(false), 500)
      }
      img.src = event.target.result
    }
    
    reader.onerror = (error) => {
      alert('Error reading file: ' + error)
      setUploading(false)
    }
    
    reader.readAsDataURL(file)
  }

  // One-time menu items fetch
  useEffect(() => {
    if (!user) return
    getDocs(collection(db, 'menu')).then(snapshot => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setMenuItems(docs)
    }).catch(err => console.warn('Menu fetch notice:', err.message))
  }, [user])

  // Seed default 19 dishes into Firestore if collection is empty
  const handleSeedMenu = async () => {
    try {
      for (const item of ALL_MENU_ITEMS) {
        await addDoc(collection(db, 'menu'), {
          name: item.title,
          description: item.description,
          price: item.price,
          category: item.category,
          categoryName: item.categoryName,
          image: item.image,
          available: true,
          rating: item.rating || 4.8,
          preparationTime: item.time || '20-25 mins',
          popular: item.category.includes('bestseller'),
          vegNonVeg: (item.title.toLowerCase().includes('paneer') || item.title.toLowerCase().includes('mushroom') || item.title.toLowerCase().includes('mashroom') || item.title.toLowerCase().includes('matar') || item.title.toLowerCase().includes('mix veg') || item.title.toLowerCase().includes('palak') || item.category.toLowerCase().includes('bread') || item.category.toLowerCase().includes('veg') || item.title.toLowerCase().includes('roti') || item.title.toLowerCase().includes('naan') || item.title.toLowerCase().includes('kulcha') || item.title.toLowerCase().includes('paratha')) ? 'veg' : 'non-veg',
          ingredients: ['Spices', 'Marination', 'Ghee'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      }
      alert(`${ALL_MENU_ITEMS.length} menu items seeded successfully into Firestore!`)
    } catch (err) {
      alert('Error seeding menu: ' + err.message)
    }
  }

  const handleOpenAdd = () => {
    setEditingItem(null)
    setName('')
    setDescription('')
    setPrice('')
    setCategory('kawab')
    setImage('/menu/Chicken tandoori kawab.jpeg')
    setVegNonVeg('non-veg')
    setPreparationTime('20-25 mins')
    setSpice('Medium')
    setAvailable(true)
    setPopular(false)
    setShowModal(true)
  }

  const handleOpenEdit = (item) => {
    setEditingItem(item)
    setName(item.name || '')
    setDescription(item.description || '')
    setPrice(item.price || '')
    setCategory(item.category || 'kawab')
    setImage(item.image || '')
    setVegNonVeg(item.vegNonVeg || 'non-veg')
    setPreparationTime(item.preparationTime || '20-25 mins')
    setSpice(item.spice || 'Medium')
    setAvailable(item.available ?? true)
    setPopular(item.popular ?? false)
    setShowModal(true)
  }

  const handleSaveItem = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        name,
        description,
        price: Number(price) || 0,
        category,
        image: image || '/menu/Chicken tandoori kawab.jpeg',
        vegNonVeg,
        preparationTime,
        spice,
        available,
        popular,
        updatedAt: serverTimestamp()
      }

      if (editingItem) {
        await updateDoc(doc(db, 'menu', editingItem.id), payload)
      } else {
        await addDoc(collection(db, 'menu'), { ...payload, createdAt: serverTimestamp() })
      }

      setShowModal(false)
    } catch (err) {
      alert('Error saving menu item: ' + err.message)
    }
  }

  const handleDeleteItem = async (id) => {
    if (!confirm('Are you sure you want to delete this menu item?')) return
    try {
      await deleteDoc(doc(db, 'menu', id))
    } catch (err) {
      alert('Error deleting item: ' + err.message)
    }
  }

  const handleToggleAvailability = async (item) => {
    try {
      await updateDoc(doc(db, 'menu', item.id), { available: !item.available })
    } catch (err) {
      console.error(err)
    }
  }

  if (!user || !isAdmin) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--ink)', color: '#ffffff' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Admin Access Required</h2>
          <Link href="/admin" className="btn" style={{ marginTop: '16px' }}>GO TO ADMIN PORTAL</Link>
        </div>
      </div>
    )
  }

  return (
    <AdminLayout activePage="menu" title="Dish Menu Management" itemCount={menuItems.length}>
      <div className="admin-page-container">
        {/* EXECUTIVE CONTROL DECK FOR MENU MANAGEMENT */}
        <div className="admin-control-hero-card">
          <div className="admin-orders-header">
            <div className="admin-title-area">
              <span className="admin-sync-pill">FOOD CATALOG CONTROL</span>
              <h1>Menu Management</h1>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {menuItems.length === 0 && (
                <button onClick={handleSeedMenu} className="btn secondary" style={{ padding: '10px 18px', fontSize: '0.82rem', borderRadius: '12px' }}>
                  ⚡ SEED INITIAL DISHES
                </button>
              )}
              <button onClick={handleOpenAdd} className="btn" style={{ padding: '10px 20px', fontSize: '0.82rem', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                + ADD NEW FOOD ITEM
              </button>
            </div>
          </div>

          {/* Search Box & Category Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="admin-search-box" style={{ maxWidth: '100%' }}>
              <span className="admin-search-icon">🔍</span>
              <input
                type="text"
                className="admin-search-input"
                placeholder="Search dish title, description, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="admin-search-clear"
                  onClick={() => setSearchQuery('')}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="status-filter-wrapper-container">
              <div className="status-filter-wrapped" role="tablist">
                {[
                  { id: 'all', label: '🍱 ALL DISHES' },
                  { id: 'biryani', label: `🍛 BIRYANI` },
                  { id: 'starters', label: `🍗 STARTERS` },
                  { id: 'main_course', label: `🍲 MAIN COURSE` },
                  { id: 'breads', label: `𫓓 BREADS` },
                  { id: 'rolls', label: `🌯 ROLLS` },
                  { id: 'beverages', label: `🥤 BEVERAGES` },
                  { id: 'combos', label: `🎁 COMBOS` }
                ].map((tab) => {
                  const itemsList = menuItems.length > 0 ? menuItems : ALL_MENU_ITEMS
                  const count = tab.id === 'all'
                    ? itemsList.length
                    : itemsList.filter(i => (i.category || '').toLowerCase().includes(tab.id)).length

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`status-counter-btn ${categoryFilter === tab.id ? 'active' : ''}`}
                      onClick={() => setCategoryFilter(tab.id)}
                    >
                      {tab.label} <span className="status-count-badge">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Menu Items Table Container */}
        <div style={{ background: '#ffffff', borderRadius: '24px', padding: '20px', border: '1px solid rgba(203, 32, 45,0.1)', boxShadow: '0 6px 20px rgba(0,0,0,0.03)' }}>
          <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid rgba(0,0,0,0.08)', color: 'var(--muted)' }}>
                  <th style={{ padding: '12px 14px', width: '38%' }}>ITEM</th>
                  <th style={{ padding: '12px 14px' }}>CATEGORY</th>
                  <th style={{ padding: '12px 14px' }}>PRICE</th>
                  <th style={{ padding: '12px 14px' }}>TYPE</th>
                  <th style={{ padding: '12px 14px' }}>STATUS</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {(menuItems.length > 0 ? menuItems : ALL_MENU_ITEMS)
                  .filter(item => {
                    if (categoryFilter !== 'all' && !(item.category || '').toLowerCase().includes(categoryFilter.toLowerCase())) return false
                    if (searchQuery.trim()) {
                      const q = searchQuery.toLowerCase().trim()
                      const titleMatch = (item.name || item.title || '').toLowerCase().includes(q)
                      const descMatch = (item.description || '').toLowerCase().includes(q)
                      const catMatch = (item.category || '').toLowerCase().includes(q)
                      return titleMatch || descMatch || catMatch
                    }
                    return true
                  })
                  .map((dish) => (
                    <tr key={dish.id || dish.title} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img src={dish.image} alt={dish.name || dish.title} style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover' }} />
                          <div>
                            <strong style={{ display: 'block', color: 'var(--ink)' }}>{dish.name || dish.title}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{dish.portion || dish.preparationTime || '20-25 mins'}</span>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '99px', background: 'rgba(203, 32, 45,0.08)', color: 'var(--deep-green)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                          {dish.categoryName || dish.category}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700 }}>₹{dish.price}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: dish.vegNonVeg === 'veg' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: dish.vegNonVeg === 'veg' ? '#16a34a' : '#dc2626' }}>
                          {dish.vegNonVeg === 'veg' ? '🟢 VEG' : '🔴 NON-VEG'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          onClick={() => dish.id && handleToggleAvailability(dish)}
                          style={{ border: 'none', background: dish.available ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.08)', color: dish.available ? '#15803d' : '#666', padding: '4px 10px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          {dish.available ? '✓ AVAILABLE' : '✕ OFF-AIR'}
                        </button>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => dish.id ? handleOpenEdit(dish) : alert('Click SEED INITIAL 19 DISHES to manage in Firestore')} style={{ border: 'none', background: 'rgba(203, 32, 45,0.1)', color: 'var(--deep-green)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                          {dish.id && <button onClick={() => handleDeleteItem(dish.id)} style={{ border: 'none', background: 'rgba(239,68,68,0.1)', color: '#dc2626', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal for Add / Edit Dish */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 9999, padding: '20px' }}>
            <div style={{ background: '#ffffff', borderRadius: '24px', padding: '28px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{editingItem ? 'Edit Dish' : 'Add New Dish'}</h3>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="co-field">
                  <label>Food Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Chicken Biryani [2 pc chicken]" required />
                </div>

                <div className="co-field">
                  <label>Description</label>
                  <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Fragrant long-grain Dum basmati rice..." required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="co-field">
                    <label>Price (₹)</label>
                    <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="220" required />
                  </div>
                  <div className="co-field">
                    <label>Category</label>
                    <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.15)', fontSize: '0.9rem' }}>
                      <option value="biryani">Biryani</option>
                      <option value="starters">Starters</option>
                      <option value="main_course">Main Course</option>
                      <option value="breads">Indian Breads</option>
                      <option value="rolls">Rolls</option>
                      <option value="beverages">Beverages</option>
                      <option value="combos">Super Saver Combos</option>
                    </select>
                  </div>
                </div>

              <div className="co-field">
                <label>Food Image</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {image && (
                    <img src={image} alt="Preview" style={{ width: '64px', height: '64px', borderRadius: '12px', objectFit: 'cover', border: '1px solid rgba(0,0,0,0.1)' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{
                        padding: '10px',
                        border: '1px dashed rgba(0,0,0,0.2)',
                        borderRadius: '12px',
                        width: '100%',
                        cursor: 'pointer',
                        background: '#f9f9f9'
                      }}
                    />
                    {uploading && (
                      <div style={{ marginTop: '8px', background: 'rgba(203, 32, 45,0.1)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--deep-green)', transition: 'width 0.2s ease' }}></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="co-field">
                  <label>Type</label>
                  <select value={vegNonVeg} onChange={e => setVegNonVeg(e.target.value)} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.15)', fontSize: '0.9rem' }}>
                    <option value="non-veg">Non-Veg 🔴</option>
                    <option value="veg">Veg 🟢</option>
                  </select>
                </div>
                <div className="co-field">
                  <label>Preparation Time</label>
                  <input type="text" value={preparationTime} onChange={e => setPreparationTime(e.target.value)} placeholder="20-25 mins" />
                </div>
              </div>

              <button type="submit" className="btn" style={{ marginTop: '10px', width: '100%', padding: '16px' }}>
                {editingItem ? 'SAVE CHANGES' : 'CREATE FOOD ITEM'}
              </button>
            </form>
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  )
}

