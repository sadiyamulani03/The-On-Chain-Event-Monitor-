# Ramesh Bakery Loyalty - Road2DevCon P1: The Loyalty Card That Can't Be Copied

## Live Demo
🌐 **Deployed:** https://theonchaineventmonitor.netlify.app

## What it does
First-time bakery customer signs in with email/Google, gets an embedded wallet automatically, sees 10-stamp loyalty card, staff awards stamps that only the server can attribute.

## Login methods enabled
- **Email** (Privy email OTP)
- **Google** (OAuth via Privy)

Configured in `src/app/providers.jsx:8-14` via `PrivyProvider` `loginMethods: ["email", "google"]` and `embeddedWallets.createOnLogin: "users-without-wallets"` so a self-custodial wallet is created on first sign-in without any "Create Wallet" click.

## How the server establishes who is asking
- Client obtains Privy access token via `getAccessToken()` from `usePrivy()` and sends it as `Authorization: Bearer <token>` on every award/balance request (`src/app/page.jsx:52-53` and `src/app/page.jsx:102-103`).
- Server verifies the token server-side with `PrivyClient.verifyAuthToken(token)` before any write, and rejects with 401 if verification throws (`src/app/api/stamp/route.js:18-24`, `src/app/api/balance/route.js:16-22`).
- The stamped identity is derived from `verifiedClaims.userId` (the Privy DID subject) returned by `verifyAuthToken`, never from `request.body` or query params (`src/app/api/stamp/route.js:27-31`). All writes are keyed by that DID in `stampStore`.
- No secrets are committed — `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_SECRET` are read from `process.env` and `.env*` is gitignored. See `.env.example` for placeholders.

## Design choices for bakery queue
- First screen is unauthenticated: single "Sign in with Email" button calls `login()` — no wallet jargon, no extension prompt.
- Embedded wallet creation is silent via `createOnLogin: "users-without-wallets"`.
- `ready` is checked first (`if (!ready) return <Loading/>` in `src/app/page.jsx:55`) so no auth branch flashes before Privy initializes.
- Route gating reads `authenticated` from `usePrivy()` (`if (!authenticated) return <LoginUI>`), not localStorage.
- Error states: initializing spinner, login abandoned returns to login screen (authenticated stays false), stamp request failures show error + retry hint.

## Tech Stack
- Next.js 15.3.6, React 19, Privy `@privy-io/react-auth` + `@privy-io/server-auth`, Ethers (unused here but kept for other problems)

## Running Locally
```bash
npm install
# set env vars
cp .env.example .env.local
# fill NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET from Privy dashboard (https://dashboard.privy.io)
npm run dev
# Visit http://localhost:3000
```

## Env vars
- `NEXT_PUBLIC_PRIVY_APP_ID` — Privy App ID (public, from dashboard)
- `PRIVY_APP_SECRET` — Privy App Secret (server-only, never committed)

## Repository
https://github.com/sadiyamulani03/The-On-Chain-Event-Monitor-
