# How to Use Kiro on This Repo

This file is a guide for opening this project in Kiro and using the built-in spec to drive the remaining implementation work.

---

## Step 1 — Open the Repo in Kiro

Clone the repo and open it:

```bash
git clone https://github.com/ctmazarura95/nextkid-mobile.git
cd nextkid-mobile
npm install
cp .env.example .env
```

Then open the `nextkid-mobile` folder in your IDE with Kiro.

---

## Step 2 — Paste This Prompt into Kiro Chat

Copy everything between the lines below and paste it into the Kiro chat input:

---

```
I'm working on the NextKid mobile app — a React Native (Expo) app for a South African school marketplace. The repo is already set up with a working backend connection, auth, and several screens. 

There is a Kiro spec at .kiro/specs/nextkid-mobile-completion/ that defines the remaining work to complete the app. 

Please open the spec, review the requirements, design, and tasks, then implement all 13 tasks in order. Work through each task fully before moving to the next. After each task, verify TypeScript compiles with `npx tsc --noEmit` before continuing.

Key context:
- Backend: AWS ECS microservices behind ALB at http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com
- Auth: AWS Cognito pool af-south-1_WLU6GeAmy / client 6u40c3sg27jsffv9r0joeaif9s (do not change these)
- All API methods are already in src/lib/api-client.ts — use them, don't create new fetch calls
- Domain types go in src/shared/types.ts
- No new npm packages unless absolutely necessary
- TypeScript strict mode is on — tsc must pass clean at the end

When all 13 tasks are done, commit with the message from Task 13 and push to origin main.
```

---

## What the Spec Contains

The spec lives at `.kiro/specs/nextkid-mobile-completion/` and has three files:

| File | What it covers |
|---|---|
| `requirements.md` | 10 requirements (REQ-1 through REQ-10) with acceptance criteria |
| `design.md` | Architecture diagram, type definitions, data-fetching patterns, file structure |
| `tasks.md` | 13 concrete implementation tasks mapped to requirements |

### Quick summary of the 13 tasks

| # | Task | Requirement |
|---|---|---|
| 1 | Add domain types (ChildProfile, Notification, Locker, etc.) | REQ-1 |
| 2 | Update api-client.ts with proper TypeScript generics | REQ-1 |
| 3 | Create `useApiCall` shared data-fetching hook | REQ-5 |
| 4 | Create `useNetworkStatus` hook | REQ-9 |
| 5 | Add network connectivity banner to root layout | REQ-9 |
| 6 | Fix Feed screen — live data from `/api/feed` with fallback | REQ-2 |
| 7 | Fix Notifications screen — live data | REQ-4 |
| 8 | Fix Children screen — live data from user-service | REQ-3 |
| 9 | Fix image upload in Sell screen via presigned S3 URLs | REQ-6 |
| 10 | Set bundle identifiers in app.json for EAS build | REQ-7, REQ-10 |
| 11 | Fix push notification token registration | REQ-8 |
| 12 | TypeScript cleanup — `tsc --noEmit` must pass clean | REQ-1 |
| 13 | Commit and push everything to `origin main` | — |

---

## What's Already Working (don't touch these)

- Sign up / sign in / sign out / password reset (Cognito)
- Profile get + update (user-service)
- Listings browse, create, edit, delete (listing-service)
- Wishlist add/remove (frontend-service)
- Orders list, detail, pay (Stitch), confirm receipt, QR codes (order-service)
- Location / school / address search (location-service)
- PUDO locker picker (frontend-service)
- All routes in `src/lib/api-client.ts`

---

## Environment Values (already in .env.example)

```
EXPO_PUBLIC_API_BASE_URL=http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com
EXPO_PUBLIC_AWS_COGNITO_USER_POOL_ID=af-south-1_WLU6GeAmy
EXPO_PUBLIC_AWS_COGNITO_CLIENT_ID=6u40c3sg27jsffv9r0joeaif9s
EXPO_PUBLIC_AWS_REGION=af-south-1
```
