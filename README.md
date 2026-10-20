# 🍲 BIRYANI BADSHAH — Next.js Enterprise Web Platform & Admin Control Desk

Welcome to the comprehensive technical documentation for **Biryani Badshah**, a state-of-the-art, high-performance web application designed for online food ordering, real-time desk management, and store administration.

---

## 📐 Architecture Overview

Biryani Badshah is architected as a hybrid Next.js web application utilizing double-layer database synchronization:
1. **Firebase Authentication & Cloud Firestore**: Handles real-time client-side auth state, global store announcements, store operational settings, food menu items, and user profile metadata.
2. **MongoDB (Mongoose Schema Layer)**: Powers transactional order processing, backend order historical records, state machines, and administrative tracking.
3. **Next.js Serverless API Engine**: Secure endpoints for server-side token validation, order creation validation, live status mutations, and session cookie refresh loops.

---

## 📂 Project Structure

```text
biryani/
├── components/           # Reusable UI components & interactive modal dialogs
│   ├── AdminLayout.js          # Responsive master layout wrapper for Admin Portal
│   ├── AnnouncementBanner.js   # Real-time Global Announcement Banner with dynamic themes & XSS safety
│   ├── AuthModal.js            # Pop-up login/signup dialog with Google OAuth & Email auth
│   ├── CheckoutModal.js        # Multi-step checkout funnel with dynamic fee math & store checks
│   └── UpiPaymentBox.js        # Interactive QR code generator & UTR verification box
├── context/              # React Context Providers for global state management
│   ├── AuthContext.js          # Global user session, admin privileges, & auth handlers
│   └── SettingsContext.js      # Real-time Firestore store settings & live announcements
├── lib/                  # Utilities, database connection helpers, & auth SDKs
│   ├── db.js                   # Mongoose connection pooling singleton
│   ├── firebase.js             # Firebase App, Auth, Firestore & Storage initializers
│   └── jwt.js                  # JWT signing & verification helpers for HttpOnly cookies
├── models/               # Mongoose MongoDB Data Schemas
│   ├── Order.js                # Enterprise Order model schema with item breakdowns & status enums
│   └── User.js                 # User schema for MongoDB fallback sync
├── pages/                # Next.js Pages Router
│   ├── _app.js                 # Main application entry point wrapping global providers
│   ├── _document.js            # HTML head customization & font preloading
│   ├── index.js                # Homepage with hero video slider, announcements, featured dishes, and quick cart
│   ├── menu.js                 # Full interactive food menu with live category filter, search, & announcements
│   ├── my-orders.js            # Customer live order tracker & history viewer
│   ├── profile.js              # Customer account management & default address manager
│   ├── admin/                  # Protected Admin Desk Control Center
│   │   ├── index.js            # Admin Dashboard overview & quick stats
│   │   ├── orders.js           # Live Kitchen Orders Desk with real-time status switches
│   │   ├── menu.js             # Dish & Menu Item Management (CRUD)
│   │   ├── coupons.js          # Promo & Coupon Discount Management Desk
│   │   ├── settings.js         # Master Store Switch & Global Announcement Control Desk
│   │   └── users.js            # Customer Directory & Admin Role Management
│   └── api/                    # Serverless API routes
│       ├── auth/
│       │   └── login.js        # Backend JWT session sync endpoint
│       └── orders/
│           ├── create.js        # Validates store status & persists new orders
│           ├── user.js          # Fetches user-specific order history
│           ├── admin-all.js     # Admin feed fetching all store orders
│           └── update-status.js # Order status state transition endpoint
└── styles/
    └── globals.css             # Master stylesheet with CSS variables, keyframe animations, & responsive rules
```

---

## 🛠️ Complete Function & API Reference Guide

### 1. Global Context Providers (`/context`)

#### `context/AuthContext.js`
- `AuthProvider({ children })`: Context Provider component wrapping the entire app. Sets up real-time Firebase `onAuthStateChanged` listeners, maintains local user profiles, enforces admin role authorization (`ADMIN_EMAILS`), and exposes session helper methods.
- `useAuth()`: Custom hook to consume the `AuthContext` value anywhere in the component tree.
- `loginWithEmail(identifier, password, isSignup, displayName)`: Authenticates via Firebase `signInWithEmailAndPassword` or `createUserWithEmailAndPassword`. Supports User ID or Email input, including `ADMIN` ID with pass `AMANULLAHPATNA2607`.
- `logout()`: Executes `firebaseSignOut(auth)` and calls `/api/auth/logout` to clear HttpOnly cookies.
- `syncWithBackend(firebaseUser)`: Internal helper function that posts the Firebase ID token to `/api/auth/login` for server-side JWT cookie synchronization.
- `updateUserProfileData(data)`: Mutates customer user profile attributes (name, phone, address) directly in Firestore `users/{uid}`.
- `openAuthModal()`: Opens the global authentication modal popup.
- `closeAuthModal()`: Closes the global authentication modal popup.

#### `context/SettingsContext.js`
- `SettingsProvider({ children })`: Subscribes to real-time updates from Firestore `settings/restaurant` document via `onSnapshot`. Exposes store availability (`isStoreOpen`), global announcements (`announcementEnabled`, `announcementText`, `announcementType`), minimum order amounts, and delivery charges.
- `useSettings()`: Custom hook to access store settings globally.

---

### 2. UI Components & Layouts (`/components`)

#### `components/AnnouncementBanner.js`
- `AnnouncementBanner({ overrideSettings, placement, className })`: Real-time global announcement banner component that displays across customer-facing pages.
- **Dynamic Themes**:
  - `info`: Royal Teal / Deep Green Accent (`📢 ANNOUNCEMENT`)
  - `warning`: Amber Flame (`⚠️ NOTICE`)
  - `success`: Emerald Green (`🎉 SPECIAL OFFER`)
  - `urgent`: Crimson Red (`🚨 URGENT UPDATE`)
- **Zero Layout Shift**: Automatically returns `null` when disabled or when announcement text is empty, ensuring no blank space or layout jumps occur.
- **XSS & Injection Protection**: Text is rendered directly as React string node `{text}` to enforce safe auto-escaping of all user input.
- **Placements**: Placed on Homepage (above Hero section), Menu Page (above menu categories), and Cart / Checkout (above Order Summary).

#### `components/AdminLayout.js`
- `AdminLayout({ children, activePage, title, itemCount })`: Master wrapper for all admin portal pages (`/admin/*`). Enforces responsive top navigation bar, quick route tab bar, dark theme container, and auto-redirects non-admin users to homepage.

#### `components/AuthModal.js`
- `AuthModal()`: Interactive modal interface for ID & Password authentication (customer registration/login and ADMIN access).
- `handleSubmit(e)`: Form submit handler for ID & Password authentication.
- `formatAuthError(err)`: Parses Firebase authentication error codes (`auth/wrong-password`, `auth/email-already-in-use`, `auth/invalid-credential`) into friendly user error strings.

#### `components/CheckoutModal.js`
- `CheckoutModal({ isOpen, onClose, cart, clearCart, settings, user, onOrderPlaced })`: Multi-step checkout modal dialog (Step 1: Contact & Delivery Address, Step 2: UPI / Cash Payment Method) featuring integrated Announcement Banner.
- `calculateSubtotal()`: Computes total cart price based on item quantities and selected variant additions.
- `calculateTax(subtotal)`: Computes GST tax charge.
- `calculateDeliveryFee(subtotal)`: Evaluates distance/subtotal tier rules to calculate delivery fee (or free delivery threshold).
- `calculateGrandTotal()`: Returns `subtotal + tax + deliveryFee - couponDiscount`.
- `handleApplyCoupon()`: Evaluates entered coupon codes against Firestore with strict 6-rule validation.
- `handleStep1Submit(e)`: Validates name, phone number, and delivery address inputs. Verifies `settings.isStoreOpen` before advancing to Step 2.
- `handleFinalOrderSubmit(e)`: Submits finalized order data to `/api/orders/create`. Verifies live store status before execution.

#### `components/UpiPaymentBox.js`
- `UpiPaymentBox({ grandTotal, storeUpiId, onPaymentComplete, onCancel })`: Interactive payment interface that generates dynamic UPI QR codes (`upi://pay?pa=...&am=...`), handles 1-click UPI app opening (GPay, PhonePe, Paytm), and captures user UTR/Transaction reference IDs.
- `generateUpiUrl()`: Constructs a standardized `upi://pay` URI string with encoded payee details and precise transaction amount.
- `handleVerifyAndPay()`: Validates that the user has entered a valid 12-digit UTR transaction number before marking payment as pending verification.

---

### 3. Application Pages (`/pages`)

#### `pages/index.js` (Homepage & Storefront)
- `Home()`: Main landing page displaying hero promotional video, global announcement banner, dish categories, featured items, and side cart drawer.
- `addToCart(dish)`: Appends an item to local storage cart or increments quantity if already existing.
- `removeFromCart(dishId)`: Decrements item quantity or removes it when count reaches zero.
- `handleProceedToCheckout()`: Checks if store is open and user is logged in before launching `CheckoutModal`.

#### `pages/menu.js` (Full Dish Menu)
- `MenuPage()`: Comprehensive food catalog page with global announcement banner, search filter, veg/non-veg toggle, and category navigation pills.
- `filterDishes()`: Filters menu items dynamically based on search query string, category tab selection, and diet preference.

#### `pages/my-orders.js` (Customer Order Tracker)
- `MyOrders()`: Live order tracking interface for logged-in users.
- `fetchUserOrders()`: Queries `/api/orders/user` to fetch real-time updates on active and past food orders.
- `getStatusBadgeClass(status)`: Returns appropriate CSS styling badge for order states (`PLACED`, `CONFIRMED`, `PREPARING`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`).

#### `pages/profile.js` (Customer Profile & Address Book)
- `Profile()`: User account configuration page.
- `handleSaveProfile(e)`: Calls `updateUserProfileData()` to save delivery addresses and phone numbers.

---

### 4. Admin Desk Portal Pages (`/pages/admin`)

#### `pages/admin/index.js` (Admin Overview)
- `AdminDashboard()`: Dashboard metrics showing total revenue, active orders count, total dishes, and live Firestore synchronization status.

#### `pages/admin/orders.js` (Live Kitchen Orders Desk)
- `AdminOrdersDesk()`: Live operational desk for kitchen staff.
- `fetchOrders()`: Calls `/api/orders/admin-all` to retrieve all store orders.
- `handleStatusUpdate(orderId, newStatus)`: Calls `/api/orders/update-status` to transition order status (`CONFIRMED` -> `PREPARING` -> `OUT_FOR_DELIVERY` -> `DELIVERED`).
- `filterOrders()`: Filters incoming orders by live tab (`Active Orders`, `Completed`, `Cancelled`, `Search by ID/Phone`).

#### `pages/admin/menu.js` (Food Item Management)
- `AdminMenuManagement()`: CRUD management interface for restaurant dishes.
- `handleSaveItem(itemData)`: Adds a new dish or updates an existing item record in Firestore `menu` collection.
- `handleDeleteItem(itemId)`: Removes a dish from the menu catalog.
- `handleToggleAvailability(itemId, currentStatus)`: Instantly toggles a dish's `isAvailable` boolean flag.

#### `pages/admin/coupons.js` (Promo & Rules-Based Coupon Engine)
- `AdminCouponsDesk()`: Full administrative control desk for creating, toggling, and deleting promo codes backed by Cloud Firestore (`coupons` collection). Supports 6 granular rule parameters (Usage limits, Expiry dates, Per-user redemptions, Minimum orders, Applicable categories, Stackability).

#### `pages/admin/settings.js` (Store Operations & Global Announcement Control Desk)
- `AdminSettingsDesk()`: Master configuration page for restaurant operations and live customer announcement publishing.
- **📢 Global Announcement Management Panel**:
  - Master Enable/Disable toggle button (`announcementEnabled`).
  - Announcement Type selector (*📢 Info*, *⚠️ Notice*, *🎉 Offer*, *🚨 Urgent*).
  - Custom announcement message input with character counter (`0 / 5000 chars`).
  - **Live Customer Banner Preview**: Interactive preview card showing exact customer-facing banner as text is typed.
- **Strict Input Validation Rules**:
  - Rejects empty announcements when enabled (`announcementText.trim() === ''`).
  - Enforces 5000 character maximum length.
  - Automatically `.trim()`s whitespace before committing to Firestore.
- `handleSaveSettings(settingsData)`: Updates `isStoreOpen`, `announcementEnabled`, `announcementText`, `announcementType`, delivery charges, tax rules, and store UPI details in Firestore `settings/restaurant`.

#### `pages/admin/users.js` (User Directory)
- `AdminUsers()`: Customer listing page allowing admins to review user accounts and grant/revoke admin roles.

---

### 5. Serverless Backend API Endpoints (`/pages/api`)

#### `pages/api/orders/create.js`
- `handler(req, res)`: `POST` request endpoint for order placement.
  1. **Closed Store Shield**: Checks Firestore `settings/restaurant` to verify `isStoreOpen !== false`. Returns `403 Forbidden` if store is turned OFF by admin.
  2. **Server-Side Coupon Rule Engine**: Re-evaluates applied coupon codes against Cloud Firestore (`coupons` collection). Validates active status, expiration date, global usage limits, minimum order thresholds, and category restrictions.
  3. Connects to MongoDB via `connectDb()`.
  4. Validates required fields (`items`, `totalAmount`, `deliveryAddress`, `customerPhone`).
  5. Generates unique readable order ID (e.g. `BB-PATNA-84920`).
  6. Saves new `Order` document in MongoDB and returns `201 Created`.

#### `pages/api/orders/user.js`
- `handler(req, res)`: `GET` request endpoint. Decodes authorization headers or query parameters to return all orders belonging to a specific user email/UID from MongoDB.

#### `pages/api/orders/admin-all.js`
- `handler(req, res)`: `GET` request endpoint reserved for admin users. Fetches all historical and active orders sorted by creation date (`createdAt: -1`).

#### `pages/api/orders/update-status.js`
- `handler(req, res)`: `POST` request endpoint to update an order's status (`orderId`, `status`). Performs state validation and updates the record in MongoDB.

#### `pages/api/auth/login.js`
- `handler(req, res)`: `POST` request endpoint. Verifies client token and sets an `HttpOnly` secure cookie for session persistence across server-side rendering.

---

### 6. Database & Helper Utilities (`/lib`)

#### `lib/db.js`
- `connectDb()`: Asynchronous database connection pool singleton. Reuses existing Mongoose connection to prevent serverless memory leaks during hot invocations.

#### `lib/firebase.js`
- `app`: Singleton instance of initialized Firebase app (`initializeApp`).
- `auth`: Firebase Auth instance with `browserLocalPersistence` enabled.
- `db`: Cloud Firestore database instance.
- `storage`: Firebase Storage instance for dish image uploads.
- `googleProvider`: Configured `GoogleAuthProvider` instance.

#### `lib/jwt.js`
- `generateAccessToken(payload)`: Generates a signed access JWT token.
- `generateRefreshToken(payload)`: Generates a signed refresh JWT token.
- `verifyAccessToken(token)` / `verifyRefreshToken(token)`: Decodes and verifies token payloads.
- `setRefreshTokenCookie(res, token)` / `clearRefreshTokenCookie(res)`: Sets or clears HttpOnly secure cookies.

---

## 🔒 Security & Store Safety Guarantees

1. **Closed Store Shield**: Backend validation in `/api/orders/create.js` blocks any incoming orders directly at the server level when `isStoreOpen` is set to `false`.
2. **Global Announcement Anti-XSS**: All announcement text is sanitized and rendered as React string nodes (`{text}`), preventing HTML injection or cross-site scripting vulnerabilities.
3. **Server-Side Coupon Rule Verification**: Re-evaluates applied coupon codes against Cloud Firestore (`coupons` collection). Recalculates verified discount server-side before accepting order to prevent client-side price tampering.
4. **Synchronous Mobile OAuth**: `signInWithPopup` is executed in the direct call stack of mobile touch events to guarantee browsers like Safari and Chrome do not flag Google login as unprompted popup popups.
5. **Role-Based Access Control (RBAC)**: Admin routes (`/admin/*`) are double-guarded by client-side auth context (`user && isAdmin`) and backend JWT verification.

---

## 🚀 Setup & Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Create a `.env.local` file containing:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   MONGODB_URI=your_mongodb_connection_string
   JWT_ACCESS_SECRET=your_access_secret
   JWT_REFRESH_SECRET=your_refresh_secret
   ```

3. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

*Documentation maintained for Biryani Badshah Enterprise Edition.*
