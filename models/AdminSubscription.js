import mongoose from 'mongoose'

const AdminSubscriptionSchema = new mongoose.Schema({
  adminUserId: {
    type: String,
    required: true,
    index: true,
  },
  adminEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  endpoint: {
    type: String,
    required: true,
    unique: true,
  },
  p256dh: {
    type: String,
    required: true,
  },
  auth: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  lastUsedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  bufferCommands: false,
})

AdminSubscriptionSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

export default mongoose.models.AdminSubscription || mongoose.model('AdminSubscription', AdminSubscriptionSchema)
