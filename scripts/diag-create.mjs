import { readFileSync } from 'fs'
const env = {}
readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') })
const login = await fetch('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'diag_uid_1', email: 'diag@demo.badshah.com', displayName: 'Diag' }) }).then(r => r.json())
const res = await fetch('http://localhost:3000/api/orders/create', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.accessToken }, body: JSON.stringify({ userId: 'diag_uid_1', userEmail: 'diag@demo.badshah.com', customerPhone: '9693900999', deliveryAddress: 'Test', items: [{ title: 'T', qty: 1, price: 220 }], subtotal: 220, deliveryCharge: 40, grandTotal: 260, orderId: 'BB-PATNA-DIAG-1' }) })
const txt = await res.text()
console.log('create status:', res.status)
console.log('body:', txt)
