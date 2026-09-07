# GI MEET

Chat, calls, group video meetings, Spot stories, Rooms, and YouTube Live — one app.
Built with React + Vite + Firebase on the frontend, LiveKit for the meeting SFU, and a
small Node backend for anything that needs a secret (LiveKit admin ops, YouTube OAuth,
GI AI summarization).

## What's built (Phases 1-7)

| Phase | Area | Highlights |
|---|---|---|
| 1 | Chat | Reactions, forward, edit, delete, pin, star, voice messages, in-chat search, mute/archive/delete chat, block/report, unread badges, online/offline + last seen |
| 2 | Calls | 1-1 voice/video (WebRTC), group voice/video calls via LiveKit, device selection, reconnect status, connection quality |
| 3 | Meetings | Scheduling, optional password, waiting room, co-host, host mute/camera-off for others, reactions, raise hand, Q&A, meeting info panel |
| 4 | Spot | My Spot / Add Spot / View Spot / Spot Updates, photo/video/text posts, 24h expiry, view tracking, reactions/replies |
| 5 | Groups + Rooms + Files | Co-admin, invite links, announcements, mentions-ready structure, "Room" mode toggle, File Hub (photos/videos/documents/links) |
| 6 | YouTube Live | Go Live flow, OAuth2, LiveKit Egress → RTMP → YouTube, live indicator, copy watch link, graceful "not configured" state |
| 7 | GI AI | On-demand chat/group/meeting-chat summarization — never runs automatically |

Polls work across Chats, Groups, and Meetings (shared `pollService`).

## Communities (new)

A **Community** is distinct from a **Group**: it bundles multiple groups under one roof with a shared, admin-only announcement channel every member auto-joins — the same pattern WhatsApp/Discord communities use. Public communities are discoverable and joinable by anyone; private ones are invite-link only. Access it via the **Groups** tab → **Communities** sub-tab (kept out of the main bottom nav to keep navigation clean, same pattern used for Rooms).

## Professional-app polish (new)

- **Confirmation dialogs** before destructive actions: leaving a group/community, removing a member/participant, blocking a user, deleting a chat/Spot, ending a meeting for everyone
- **Toast notifications** for confirmations (copied link, report submitted, info updated) instead of inline "Copied!" text scattered around
- **Loading skeletons** on list screens instead of bare "Loading…" text

## Project layout

```
gi-meet-app/
  src/                 the React app
  server/              Node backend: LiveKit tokens/admin, YouTube OAuth + Live, GI AI
  functions/           Firebase Cloud Functions: push notification triggers
  firestore.rules, firestore.indexes.json, storage.rules, firebase.json
```

## Setup

### 1. Firebase project
Auth (Email/Password + Google), Firestore, Storage, a service account key, and (optionally)
a Cloud Messaging VAPID key. See prior setup notes — nothing new here from earlier phases.

Deploy rules/indexes/functions:
```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules,functions
```

**New:** In Firestore Console → TTL policies, enable a TTL policy on the `spots` collection's
`expiresAt` field so expired Spots are automatically deleted. Without this, expired Spots are
still filtered out client-side, but they won't actually be removed from the database.

### 2. LiveKit
Same as before — `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` in `server/.env`.

### 3. YouTube Live (optional)
Same as before — Google Cloud OAuth client in `server/.env`.

### 4. GI AI (optional)
Set `GI_AI_API_KEY` in `server/.env` to an Anthropic API key (the backend calls the
Anthropic Messages API by default — swap the implementation in
`server/src/routes/giAi.js` if you'd rather use a different provider). Without this key,
the "✨ GI AI" button shows a clear "not configured" error instead of doing nothing.

**Important limitation:** GI AI meeting notes summarize the *meeting text chat only* —
there is no audio transcript in this build. Real spoken-meeting summarization would need
LiveKit Egress piped through a speech-to-text service (e.g. Deepgram, Whisper), which is
additional infrastructure beyond an API key and isn't wired up yet.

### 5. Run everything locally
```bash
# Frontend
npm install && npm run dev

# Backend (separate terminal)
cd server && npm install && npm run dev
```

## Sound system

Ringtones and notification chimes are synthesized with the Web Audio API (`src/services/soundService.ts`) — no audio asset files to manage:
- **Incoming call** — ringtone loops until accepted/declined
- **Outgoing call** — ringback tone while waiting for the other side to answer, a short chime once connected
- **New chat/group message** — short chime (skipped for muted chats, and skipped on initial chat-list load so it doesn't fire retroactively)
- **Meeting** — chime when someone joins/leaves

**Fixed:** voice calls were previously silent (video worked because its `<video>` element incidentally carried the remote audio track; voice-only calls rendered no audio-playing element at all). `CallScreen.tsx` now always mounts a hidden `<audio>` element bound to the remote stream regardless of call type.

## Known MVP simplifications
- Meeting join/leave/waiting-room updates use looser Firestore rules than other collections
  (see comments in `firestore.rules`) — move to a Cloud Function with transactions for a
  real production launch.
- Meeting passwords are checked client-side against a SHA-256 hash — fine for "keep randoms
  out," not hardened security.
- Spot visibility = your 1-1 chat partners + group co-members (computed client-side on load,
  capped at 30 contacts due to Firestore `in`-query limits) — not a dedicated "friends" graph.
- No TURN server configured for 1-1 WebRTC calls — some users behind strict NATs may fail to
  connect (LiveKit-based group calls/meetings don't have this problem — LiveKit Cloud handles
  TURN for you).
- File Hub aggregates one chat/group's attachments at a time (via `/files/chats/:id` or
  `/files/groups/:id`); a fully global cross-conversation file view isn't built.
- Mentions (`@username`) have the data model in place (message text) but no autocomplete
  picker or highlighted-mention UI yet — typing `@username` sends as plain text.
- Meeting scheduling reminders (push notifications ahead of a scheduled meeting) aren't
  wired up — the Cloud Function for that would need a scheduled trigger, not just an
  on-create trigger like the existing notification functions.
