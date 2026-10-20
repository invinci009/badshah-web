import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  displayName: {
    type: String,
    default: '',
  },
  photoURL: {
    type: String,
    default: '',
  },
  // Store only the latest refresh token for token rotation & session validation
  latestRefreshToken: {
    type: String,
    default: null,
  },
  // RBAC role: 'customer' | 'staff' | 'admin'
  role: {
    type: String,
    enum: ['customer', 'staff', 'admin'],
    default: 'customer',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
})

UserSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

export default mongoose.models.User || mongoose.model('User', UserSchema)
