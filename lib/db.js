import mongoose from 'mongoose'

// Disable Mongoose command buffering globally so queries fail fast / skip gracefully when offline
try {
  mongoose.set('bufferCommands', false)
  mongoose.set('bufferTimeoutMS', 2000)
} catch (e) {}

const MONGODB_URI = process.env.MONGODB_URI || ''

let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

export async function connectDb() {
  // If connection is cached and alive, return immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn
  }

  // If URI is missing or contains un-replaced placeholder <db_password>, skip Mongoose gracefully
  if (!MONGODB_URI || MONGODB_URI.includes('<db_password>')) {
    return null
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 3000, // 3 second quick timeout instead of 30s delay!
    }

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      console.log('MongoDB Atlas Connected Successfully! 🍃')
      return mongooseInstance
    }).catch(err => {
      console.warn('MongoDB Connection Warning:', err.message)
      cached.promise = null
      return null
    })
  }

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    console.warn('Failed to resolve MongoDB connection:', e.message)
  }

  return (cached.conn && mongoose.connection.readyState === 1) ? cached.conn : null
}

