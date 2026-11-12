# NextKid Mobile — Testing & Deployment Guide

This document covers everything needed to run the app locally, test it on a device, and build it for distribution.

---

## Prerequisites

You need these installed before anything else:

| Tool | Version | Install |
|---|---|---|
| Node.js | 18 or higher | https://nodejs.org |
| npm | comes with Node | — |
| Expo Go app | latest | App Store / Play Store |
| EAS CLI | latest | `npm i -g eas-cli` |
| AWS CLI | v2 | https://aws.amazon.com/cli |
| Expo account | free | https://expo.dev |

> You do **not** need Xcode or Android Studio to run the app on a physical device. You do need them to run on a simulator/emulator.

---

## 1. Getting the Code

```bash
git clone https://github.com/ctmazarura95/nextkid-mobile.git
cd nextkid-mobile
npm install
```

---

## 2. Environment Setup

```bash
cp .env.example .env
```

The `.env` file is already pre-filled with the correct values. You should not need to change anything:

```env
# Backend — microservices ALB (Cape Town, af-south-1)
EXPO_PUBLIC_API_BASE_URL=http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com

# Cognito — shared pool, do not change
EXPO_PUBLIC_AWS_COGNITO_USER_POOL_ID=af-south-1_WLU6GeAmy
EXPO_PUBLIC_AWS_COGNITO_CLIENT_ID=6u40c3sg27jsffv9r0joeaif9s
EXPO_PUBLIC_AWS_REGION=af-south-1
```

**Verify the backend is up before testing:**

```bash
curl -s http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com/api/health
# Expected: {"status":"ok"} or similar 200 response
```

If that returns nothing or errors, the ECS services may need to be started — see section 6 below.

---

## 3. Running Locally

### Option A — Physical device (fastest, no setup needed)

1. Install **Expo Go** on your iPhone or Android phone
2. Run the dev server:
   ```bash
   npm run dev
   ```
3. Scan the QR code shown in the terminal with your phone's camera (iOS) or the Expo Go app (Android)

The app loads directly on your phone. Hot reload works — save a file and the app updates instantly.

### Option B — iOS Simulator (Mac only, needs Xcode)

```bash
npm run ios
```

### Option C — Android Emulator (needs Android Studio)

```bash
npm run android
```

---

## 4. Test Flows

Work through these in order. Each one builds on the last.

### 4.1 — Sign Up

1. Open the app
2. Tap **"Don't have an account? Sign up"**
3. Enter an email and password (min 8 chars)
4. Check the email inbox — you'll get a 6-digit verification code from AWS Cognito
5. Enter the code in the app
6. You should land on the **Onboarding** screen

> If signup fails with "User already exists", use **Forgot Password** to reset it.

### 4.2 — Onboarding

Complete the 3-step profile setup:

1. **Step 1** — Enter your full name
2. **Step 2** — Date of birth (optional, tap Continue to skip)
3. **Step 3** — Location
   - The app requests location permission — tap **Allow While Using**
   - It auto-fills your suburb and city via GPS reverse-geocode
   - If GPS is denied, type your suburb in the address search box
   - Optionally search for and select a school
4. Tap **Finish** — you land on the Home tab

### 4.3 — Browse Listings

- Home tab loads the feed — you should see listings if the listing-service has data
- Tap a listing to open the detail screen
- Verify image loads, price displays, condition badge shows

> If the feed shows empty or errors, the database may need seeding — see section 6.

### 4.4 — Create a Listing (Sell tab)

1. Tap the **Sell** tab (tag icon)
2. Pick a category (e.g. School Uniforms)
3. Fill in subcategory, condition, size, price
4. Add a photo (camera or gallery)
5. Tap **List Item**
6. Verify it appears on your Profile tab under "My Listings"

### 4.5 — Wishlist

1. Open any listing
2. Tap the heart icon
3. Go to **Wishlist** tab — item should appear
4. Tap again to remove

### 4.6 — Profile

- Tap **Profile** tab
- Verify your name, email, and school display correctly
- Test editing location / school
- Tap **Sign Out** — should return to login screen

### 4.7 — Password Reset

1. On the login screen tap **Forgot password?**
2. Enter your email — you get a code via email
3. Enter the code + new password
4. Sign back in with the new password

---

## 5. What's Working vs What Needs More Backend Work

| Feature | Status | Notes |
|---|---|---|
| Sign up / sign in / sign out | ✅ | Cognito-backed |
| Password reset | ✅ | Cognito email flow |
| Profile — get & update | ✅ | user-service |
| Browse listings | ✅ | listing-service |
| Create / edit / delete listing | ✅ | listing-service |
| Wishlist | ✅ | frontend-service |
| Orders — list & detail | ✅ | order-service |
| Order — pay (Stitch) | ✅ | order-service |
| Drop-off / collection QR codes | ✅ | order-service |
| Location search (address / suburb) | ✅ | location-service |
| School search | ✅ | location-service |
| PUDO locker picker | ✅ | frontend-service |
| Personalised feed | ⚠️ | Needs child_profiles + size_predictions DB tables |
| Children / size profiles | ⚠️ | Needs child_profiles DB table |
| Push notifications | ⚠️ | Needs notifications DB table + Expo token setup |
| Klerebank / referrals | ⚠️ | Needs ledger DB tables |

---

## 6. Backend — Checking & Starting ECS Services

If APIs are returning errors, check that the ECS services are running:

```bash
# Check which services are running
aws ecs list-services \
  --cluster nextkid-microservices-cluster \
  --region af-south-1 \
  --output table

# Check a specific service's status
aws ecs describe-services \
  --cluster nextkid-microservices-cluster \
  --services nextkid-location-service nextkid-user-service nextkid-listing-service \
  --region af-south-1 \
  --query "services[*].{Name:serviceName,Running:runningCount,Desired:desiredCount,Status:status}" \
  --output table
```

If a service has 0 running tasks, force a new deployment:

```bash
aws ecs update-service \
  --cluster nextkid-microservices-cluster \
  --service nextkid-location-service \
  --force-new-deployment \
  --region af-south-1
```

To run the DB schema migrations (unblocks feed, children, notifications):

```bash
# Connect to the bastion host
aws ssm start-session --target i-00d19cc49398df476 --region af-south-1

# Inside the bastion:
export PGPASSWORD='NextKid2026SecureDb!Please-Change-This-Password'
DB_HOST='nextkid-production.ctak6uqy8wkv.af-south-1.rds.amazonaws.com'
psql -h $DB_HOST -U nextkid_admin -d nextkid \
  -f ~/nextkid-microservices/terraform/schemas.sql
```

---

## 7. Building a Test Binary (EAS Build)

This creates a real installable binary without needing the App Store. Good for sharing with testers.

### First-time setup

```bash
# Log in to Expo
eas login
# Enter credentials for the ctmazarura95 Expo account

# Link the project (one-time)
eas build:configure
```

### Build a preview binary

```bash
# Builds both iOS (.ipa) and Android (.apk) — takes ~15 minutes
npm run build:preview
```

- **iOS** → downloads as `.ipa`, install via TestFlight or direct device install (needs Apple Developer account)
- **Android** → downloads as `.apk`, install directly on any Android device

### Android-only (quickest for sharing)

```bash
npm run build:android
```

Once built, EAS gives you a QR code or download link. Share that link with anyone to install on their Android device.

### iOS-only

```bash
npm run build:ios
```

iOS `.ipa` files require either:
- **TestFlight** — upload via App Store Connect (needs Apple Developer account, $99/year)
- **Ad-hoc distribution** — device UDIDs registered in the provisioning profile

---

## 8. Deploying to App Stores

### Apple App Store

1. Add `bundleIdentifier` to `app.json`:
   ```json
   "ios": {
     "bundleIdentifier": "co.za.nextkid.app",
     "supportsTablet": true
   }
   ```
2. Add `package` to `app.json`:
   ```json
   "android": {
     "package": "co.za.nextkid.app"
   }
   ```
3. Update `eas.json` submit section with your Apple credentials
4. Run a production build:
   ```bash
   npm run build:ios
   ```
5. Submit:
   ```bash
   npm run submit:ios
   ```

### Google Play Store

1. Create a Google Play app in the Play Console
2. Download a Google service account JSON key
3. Save it as `google-service-account.json` in the project root (already in `.gitignore`)
4. Run a production build:
   ```bash
   npm run build:android
   ```
5. Submit:
   ```bash
   npm run submit:android
   ```

---

## 9. Useful Commands

```bash
# Start dev server
npm run dev

# Type check — catch TypeScript errors without building
npm typecheck

# Check backend health
curl http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com/api/health

# View ECS logs (replace service name as needed)
aws logs tail /ecs/nextkid-user-service --follow --region af-south-1

# List recent EAS builds
eas build:list

# View a specific build
eas build:view

# Cancel a running build
eas build:cancel
```

---

## 10. Troubleshooting

**"Network request failed" on every API call**
- Check the ALB is up: `curl http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com/api/health`
- If on a physical device, make sure you're not on a corporate network blocking port 80
- The ALB is HTTP (not HTTPS) until the ACM certificate is configured

**"NotAuthorizedException: Incorrect username or password"**
- Password must be 8+ characters
- Check Caps Lock
- Use Forgot Password to reset

**"UserNotConfirmedException"**
- The account was created but the email was never verified
- Tap Sign Up again with the same email — it will re-send the code

**App crashes on launch**
- Run `npm run dev` and check the Metro terminal for JS errors
- Make sure `.env` exists (copied from `.env.example`)

**Feed is empty / 500 error**
- The child_profiles table migration hasn't run yet — see section 6
- Check ECS logs: `aws logs tail /ecs/nextkid-frontend-service --follow --region af-south-1`

**EAS build fails with "project not found"**
- Run `eas build:configure` to link the project to your Expo account
- Make sure you're logged in: `eas whoami`

**iOS simulator not opening**
- Xcode must be installed and the simulator downloaded
- Run: `xcode-select --install`

---

*Last updated: August 2026*
*Repo: https://github.com/ctmazarura95/nextkid-mobile*
*Backend: nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com*
*Cognito pool: af-south-1_WLU6GeAmy*
