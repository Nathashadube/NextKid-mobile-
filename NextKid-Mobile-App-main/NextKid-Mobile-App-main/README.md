# NextKid Mobile

React Native (Expo) app for the NextKid school marketplace platform.

**Stack**: Expo SDK 54 · Expo Router v6 · React Native 0.81 · TypeScript · AWS Cognito auth

---

## Quick Start

### 1. Prerequisites

```bash
node --version   # 18+
npm i -g expo-cli eas-cli
```

### 2. Clone & Install

```bash
git clone git@github.com:your-org/nextkid-mobile.git
cd nextkid-mobile
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` — the defaults are already correct for the production microservices ALB:

```env
# Already set to the microservices ALB — change only if your ALB DNS has changed:
EXPO_PUBLIC_API_BASE_URL=http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com

# Cognito pool (shared across all services — do not change):
EXPO_PUBLIC_AWS_COGNITO_USER_POOL_ID=af-south-1_WLU6GeAmy
EXPO_PUBLIC_AWS_COGNITO_CLIENT_ID=6u40c3sg27jsffv9r0joeaif9s
EXPO_PUBLIC_AWS_REGION=af-south-1
```

> To confirm the ALB is running: `aws elbv2 describe-load-balancers --region af-south-1 --query "LoadBalancers[?contains(LoadBalancerName,'nextkid')].State" --output table`

### 4. Run

```bash
npm run dev          # Expo dev server on port 8082
npm run ios          # Open in iOS Simulator
npm run android      # Open in Android Emulator
```

Scan the QR code with the **Expo Go** app on your phone to test on a real device.

---

## API Connection Guide

The mobile app talks directly to the **microservices ALB** — a single DNS entry that routes each path prefix to the correct ECS service.

```
ALB: nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com
```

### ALB Routing (from terraform/ecs-services.tf)

| Path pattern | ECS Service | Priority |
|---|---|---|
| `/api/locations/*` | location-service | 10 |
| `/api/profile*`, `/api/children*`, `/api/account*` | user-service | 20 |
| `/api/listings/*`, `/api/categories*` | listing-service | 30 |
| `/api/schools/*` | school-service | 40 |
| `/api/orders/*` | order-service | 50 |
| `/*` (catch-all) | frontend-service (Next.js) | 100 |

Every request from the mobile app goes to the **same ALB URL**. The ALB forwards it to the right microservice based on the path. The mobile app does not need to know which service handles which path.

### Current API Status

| Endpoint | Routes to | Status |
|---|---|---|
| `GET /api/profile` | user-service | ✅ Working |
| `PUT /api/profile` | user-service | ✅ Working |
| `GET /api/listings` | listing-service | ✅ Working |
| `GET /api/listings/:id` | listing-service | ✅ Working |
| `POST /api/listings/create` | listing-service | ✅ Working |
| `PUT /api/listings/:id` | listing-service | ✅ Working |
| `DELETE /api/listings/:id` | listing-service | ✅ Working |
| `GET /api/wishlist` | frontend-service | ✅ Working |
| `POST /api/wishlist/:id` | frontend-service | ✅ Working |
| `DELETE /api/wishlist/:id` | frontend-service | ✅ Working |
| `GET /api/orders` | order-service | ✅ Working |
| `GET /api/orders/:id` | order-service | ✅ Working |
| `POST /api/orders` | order-service | ✅ Working |
| `POST /api/orders/:id/pay` | order-service | ✅ Working |
| `POST /api/orders/:id/confirm-receipt` | order-service | ✅ Working |
| `GET /api/orders/:id/qr/dropoff` | order-service | ✅ Working |
| `GET /api/orders/:id/qr/collection` | order-service | ✅ Working |
| `GET /api/locations/places/autocomplete` | location-service | ✅ Working |
| `GET /api/locations/places/details` | location-service | ✅ Working |
| `GET /api/locations/places/reverse` | location-service | ✅ Working |
| `GET /api/locations/schools/search` | location-service | ✅ Working |
| `GET /api/schools/:id` | school-service | ✅ Working |
| `GET /api/feed` | frontend-service | ⚠️ Needs child_profiles + size_predictions tables |
| `GET /api/children` | user-service | ⚠️ Needs child_profiles table migration |
| `GET /api/notifications` | frontend-service | ⚠️ Needs notifications table |

### Authentication Flow

Auth is handled entirely by **AWS Cognito** — the mobile app never sends passwords to any backend service.

```
1. User signs in → Cognito returns JWT tokens (stored in SecureStore)
2. Every API call → JWT access token attached as Authorization: Bearer <token>
3. Each microservice → verifies JWT against Cognito JWKS endpoint
4. Token expires → getSession() auto-refreshes using the refresh token
5. Refresh fails → user is signed out and redirected to login
```

The Cognito client is in `src/lib/auth/cognito.ts`. Token management is transparent — screens just call API methods from `src/lib/api-client.ts`.

### Getting the ALB DNS

```bash
# From Terraform output
cd /Users/collinsmac/nextkid/nextkid-microservices/terraform
terraform output alb_dns_name

# Or from AWS CLI
aws elbv2 describe-load-balancers \
  --region af-south-1 \
  --query "LoadBalancers[?contains(LoadBalancerName,'nextkid')].DNSName" \
  --output text
```

### Unblocking the ⚠️ Endpoints

The feed, children, and notifications endpoints need DB schema migrations:

```bash
# Connect to bastion
aws ssm start-session --target i-00d19cc49398df476 --region af-south-1

# Inside bastion:
export PGPASSWORD='<password from Secrets Manager>'
DB_HOST='nextkid-production.ctak6uqy8wkv.af-south-1.rds.amazonaws.com'
psql -h $DB_HOST -U nextkid_admin -d nextkid \
  -f /path/to/nextkid-microservices/terraform/schemas.sql
```

---

## Project Structure

```
nextkid-mobile/
├── app/                    # Expo Router screens (file-based routing)
│   ├── _layout.tsx         # Root layout — auth check, push notification setup
│   ├── index.tsx           # Login / signup screen
│   ├── onboarding.tsx      # New user profile setup
│   ├── (tabs)/             # Main tab navigator
│   │   ├── index.tsx       # Home / feed
│   │   ├── sell.tsx        # List an item
│   │   ├── orders.tsx      # Order history
│   │   ├── wishlist.tsx    # Saved items
│   │   ├── notifications.tsx
│   │   └── profile.tsx     # User profile + settings
│   ├── item/[id].tsx       # Listing detail
│   ├── checkout/[listingId].tsx
│   ├── order/[id].tsx
│   ├── admin/              # Admin-only screens
│   └── auth/reset-password.tsx
│
├── src/
│   ├── lib/
│   │   ├── api-client.ts   # All API calls — EDIT THIS for new endpoints
│   │   ├── auth/cognito.ts # Cognito auth — sign in/up/out, token management
│   │   ├── cart.ts         # Cart state (AsyncStorage)
│   │   └── pushNotifications.ts
│   ├── components/
│   │   └── LockerPicker.tsx
│   └── shared/             # Shared types + utils (inlined from packages/shared)
│       ├── types.ts         # Domain types: Listing, Order, Profile, etc.
│       ├── constants.ts     # Categories, sizes, provinces
│       ├── pricing.ts       # Buyer price calculator
│       └── types/
│           ├── shipping.ts
│           └── location.ts
│
├── assets/                 # Fonts, images, app icons
├── components/             # Reusable UI components
├── constants/Colors.ts     # Theme colours
│
├── .env.example            # ← Copy to .env and fill in
├── eas.json                # EAS Build profiles
└── app.json                # Expo config
```

---

## Building for Distribution

### EAS Build Setup (first time only)

```bash
npx eas-cli login
npx eas-cli build:configure   # creates project in Expo dashboard
```

### Internal Test Build (TestFlight / Play Store Internal)

```bash
npm run build:preview         # builds both iOS and Android
```

### Production Build

```bash
npm run build:android         # AAB for Play Store
npm run build:ios             # IPA for App Store
```

### Submit to Stores

```bash
npm run submit:ios            # after filling in eas.json submit config
npm run submit:android
```

---

## Adding a New API Endpoint

1. Add the method to `src/lib/api-client.ts`:
   ```typescript
   export const newFeatureApi = {
     list: () => get<SomeType[]>('/api/new-feature'),
     create: (data: unknown) => post('/api/new-feature', data),
   };
   ```

2. Import and call it in your screen:
   ```typescript
   import { newFeatureApi } from '@/src/lib/api-client';
   const data = await newFeatureApi.list();
   ```

Auth headers are attached automatically. Error handling via `ApiError`.

---

## Tech Notes

- **Cognito tokens** are stored in `expo-secure-store` (encrypted on-device storage)
- **Cart** is stored in `AsyncStorage` — survives app restarts, cleared on checkout
- **Images** are uploaded directly to S3 via presigned URLs (no file data goes through the API)
- **Push notifications** use Expo's push service — tokens are saved to the user's profile via `PUT /api/profile`
- The `@/` alias maps to the project root (e.g. `@/src/lib/api-client`)
