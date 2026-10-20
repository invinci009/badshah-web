/**
 * GET /api/reviews — REAL Google reviews for Biryani Badshah.
 *
 * Priority:
 *   1. Google Places Details API (needs GOOGLE_PLACES_API_KEY + Place ID from
 *      env or Admin → Settings `googlePlaceId`). Results cached in memory
 *      for 6h and mirrored into Firestore `config/google_reviews_cache` so
 *      the site still has data if Google goes down.
 *   2. Firestore `curated_reviews` collection (docs: author, rating, text,
 *      relativeTime, source 'google', active=true) — lets the owner pin
 *      real reviews manually until/unless the API key is set.
 *   3. { source: 'none' } — the homepage keeps its static showcase cards.
 */
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h
let memCache = { at: 0, data: null }

const RESTAURANT_QUERY = encodeURIComponent('Biryani Badshah, Phulwari Sharif, Patna')

function mapGoogleReview(r) {
  return {
    id: 'g_' + (r.author_name || '') + '_' + (r.time || ''),
    author: r.author_name || 'Google Reviewer',
    rating: Number(r.rating) || 5,
    text: (r.text || '').trim(),
    relativeTime: r.relative_time_description || '',
    authorUrl: r.author_url || null,
    photo: r.profile_photo_url || null,
    source: 'google',
  }
}

async function fetchFromGoogle(placeId, apiKey) {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=name,rating,user_rating_total,url,reviews` +
    `&key=${apiKey}&reviews_sort=newest&reviews_no_translations=false&language=en-IN`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Places API HTTP ' + res.status)
  const data = await res.json()
  if (data.status !== 'OK') throw new Error('Places API status ' + data.status)
  const result = data.result || {}
  const reviews = (result.reviews || []).map(mapGoogleReview)
  return {
    source: reviews.length ? 'google' : 'none',
    place: { name: result.name || null, url: result.url || null },
    rating: result.rating || null,
    total: result.user_rating_total || 0,
    reviews,
  }
}

async function fetchCurated() {
  try {
    let q = query(collection(db, 'curated_reviews'), where('active', '==', true), limit(8))
    const snap = await getDocs(q)
    let list = snap.docs.map(d => ({ id: d.id, ...d.data(), source: 'google' }))
    if (list.length) {
      list = list.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6)
      return { source: 'curated', place: null, rating: null, total: null, reviews: list }
    }
  } catch (e) {}
  return null
}

async function readFSCache() {
  try {
    const snap = await getDoc(doc(db, 'config', 'google_reviews_cache'))
    if (snap.exists()) return snap.data()?.data || null
  } catch (e) {}
  return null
}

async function writeFSCache(data) {
  try {
    await setDoc(doc(db, 'config', 'google_reviews_cache'), { data, updatedAt: new Date().toISOString() })
  } catch (e) {}
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')

  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ''

    // Place ID: env override → Admin settings doc → skip
    let placeId = process.env.GOOGLE_PLACE_ID || process.env.NEXT_PUBLIC_GOOGLE_PLACE_ID || ''
    if (!placeId) {
      try {
        const snap = await getDoc(doc(db, 'settings', 'restaurant'))
        placeId = snap.exists() ? (snap.data().googlePlaceId || '') : ''
      } catch (e) {}
    }

    // 1. Memory cache
    if (memCache.data && Date.now() - memCache.at < CACHE_TTL_MS) {
      return res.status(200).json(memCache.data)
    }

    // 2. Live Google fetch
    if (apiKey && placeId) {
      try {
        const fresh = await fetchFromGoogle(placeId, apiKey)
        memCache = { at: Date.now(), data: fresh }
        writeFSCache(fresh)
        return res.status(200).json(fresh)
      } catch (gErr) {
        console.warn('Google reviews fetch warning:', gErr.message)
        const cache = await readFSCache()
        if (cache) return res.status(200).json(cache)
      }
    }

    // 3. Firestore mirror of a previous successful Google pull
    const cache = await readFSCache()
    if (cache && cache.source === 'google' && cache.reviews?.length) {
      memCache = { at: Date.now(), data: cache }
      return res.status(200).json(cache)
    }

    // 4. Curated real reviews (owner-entered)
    const curated = await fetchCurated()
    if (curated) {
      memCache = { at: Date.now(), data: curated }
      return res.status(200).json(curated)
    }

    memCache = { at: Date.now(), data: { source: 'none', place: null, rating: null, total: null, reviews: [] } }
    return res.status(200).json(memCache.data)
  } catch (e) {
    console.error('Reviews API Error:', e.message)
    return res.status(200).json({ source: 'none', place: null, rating: null, total: null, reviews: [] })
  }
}
