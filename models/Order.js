import mongoose from 'mongoose'

const OrderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: String,
    required: true,
  },
  userEmail: {
    type: String,
    required: true,
  },
  customerEmail: String,
  userName: String,
  customerName: String,
  userPhone: String,
  customerPhone: String,
  deliveryAddress: {
    type: String,
    required: true,
  },
  items: [
    {
      title: { type: String, required: true },
      qty: { type: Number, required: true },
      price: { type: Number, required: true },
      image: { type: String },
    }
  ],
  subtotal: Number,
  deliveryCharge: Number,
  tax: Number,
  discount: Number,
  grandTotal: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    default: 'Pending',
  },
  orderStatus: {
    type: String,
    default: 'payment_verification_pending',
  },
  paymentMethod: {
    type: String,
    default: 'UPI',
  },
  paymentStatus: {
    type: String,
    default: 'verification_pending',
  },
  customerMarkedPaid: {
    type: Boolean,
    default: false,
  },
  transactionReference: String,
  razorpayPaymentId: String,
  razorpayOrderId: String,
  razorpaySignature: String,
  paymentVerifiedBy: String,
  paymentVerifiedAt: Date,
  rejectionReason: String,
  notificationSent: {
    type: Boolean,
    default: false,
  },
  refund: {
    requested: { type: Boolean, default: false },
    status: { type: String, default: 'NONE' },
    requestedAt: Date,
    processingAt: Date,
    refundedAt: Date,
    refundedBy: String,
    amount: Number,
    cancellationReason: String
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

export default mongoose.models.Order || mongoose.model('Order', OrderSchema)
