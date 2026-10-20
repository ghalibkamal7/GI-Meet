# GI MEET backend

Small Node/Express service that holds every secret the frontend must never see:
LiveKit meeting tokens + room admin, and the full YouTube Live OAuth/broadcast pipeline.

## Why this exists

The frontend (Vite/React) ships to the browser — anything in it is public. LiveKit API
secrets and YouTube OAuth client secrets/refresh tokens have to live somewhere that never
reaches the browser. This service is that "somewhere."

## What you need before this actually works

| Requirement | Where to get it |
|---|---|
| Firebase service account JSON | Firebase Console → Project Settings → Service Accounts → Generate new private key |
| LiveKit API key + secret + URL | [LiveKit Cloud](https://cloud.livekit.io) project (free tier available), or your own self-hosted server |
| Google OAuth 2.0 client (Web app) | Google Cloud Console → APIs & Services → Credentials, with **YouTube Data API v3** enabled on the project |

None of these can be fabricated — they require you to create real accounts/projects.
Until they're filled in, `/api/livekit/token` and the `/api/youtube/*` routes will
throw a clear "not configured" error rather than pretending to work.

## Setup

```bash
cd server
npm install
cp .env.example .env
# fill in .env with the values from the table above
npm run dev
```

The server runs on `http://localhost:8080` by default. Point the frontend's
`VITE_BACKEND_URL` at wherever you deploy this (Cloud Run is a natural fit since it's
already a container-friendly Node service with no persistent local state other than
the in-memory viewer-count pollers noted in `routes/youtube.js`).

## Routes

- `POST /api/livekit/token` — mints a LiveKit room-join token for the authenticated user
- `GET /api/meetings/:room/preview` — returns only lobby-safe meeting state for an authenticated user
- `POST /api/meetings/protected` — creates a password-protected meeting with a server-side scrypt verifier
- `POST /api/meetings/:room/authorize` — verifies a meeting password and issues a short-lived join authorization
- `POST /api/meetings/:room/join` — transactionally consumes protected-meeting authorization and records membership
- `POST /api/meetings/:room/kick` — host-only: force-removes a participant from a LiveKit room
- `GET /api/youtube/auth-url-redirect?idToken=...` — starts the Google OAuth consent flow (opened in a popup)
- `GET /api/youtube/oauth-callback` — Google redirects here; exchanges the code for tokens and stores them server-side
- `GET /api/youtube/status` — whether the current user has connected YouTube
- `POST /api/youtube/go-live` — creates a YouTube broadcast+stream, starts a LiveKit RTMP Egress into it
- `POST /api/youtube/stop-live` — stops the Egress and completes the YouTube broadcast

## Legacy meeting-password migration

The migration CLI is dry-run by default. It requires `FIREBASE_SERVICE_ACCOUNT_JSON` and an
explicit `--project=<firebase-project-id>` matching the service account. It converts legacy
root-level SHA-256 hashes to server-only legacy verifier documents and removes the root field;
the next successful password check upgrades that verifier to scrypt. It is idempotent and does
not delete meetings.

```bash
npm run migrate:legacy-meeting-passwords -- --project=<firebase-project-id>
npm run migrate:legacy-meeting-passwords -- --project=<firebase-project-id> --apply
```

Review the project and dry-run output before applying. In deployment, publish Firestore rules
first (legacy protected meetings become temporarily unavailable, not exposed), migrate the
legacy documents, then deploy the backend and frontend. Never run the apply command against
production without the required approval and an independently reviewed backup.

Every route except the OAuth redirect/callback requires a `Bearer <Firebase ID token>` header.
