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

#### Protected-meeting security rollout

Protected-meeting password verifiers are server-only. Existing meetings that still store a
legacy `passwordHash` at the document root are denied client reads by the rules until migrated;
this is intentionally fail-closed and may temporarily make those meetings unavailable.

For a rollout, deploy Firestore rules first, then run a migration dry-run with a service account
whose `project_id` matches the explicit project argument. Review the counts and verify the target
project before repeating with `--apply`; the migration is idempotent and never deletes a meeting.
Only after migration completes should the backend and then the frontend be deployed. This order
avoids an interval where legacy hashes are client-readable or protected-meeting joins can bypass
server authorization. Do not run the migration against production without an independently
reviewed backup and explicit production approval.

```bash
cd server
npm run migrate:legacy-meeting-passwords -- --project=<firebase-project-id>
# Review the dry-run and selected project before applying:
npm run migrate:legacy-meeting-passwords -- --project=<firebase-project-id> --apply
```

`FIREBASE_SERVICE_ACCOUNT_JSON` must be supplied through a secret-safe environment mechanism;
the CLI does not choose a project or attempt a Firebase connection without it.

**New:** In Firestore Console → TTL policies, enable a TTL policy on the `spots` collection's
`expiresAt` field so expired Spots are automatically deleted. Without this, expired Spots are
still filtered out client-side, but they won't actually be removed from the database.
Spot audience feed entries and owner-only audience indexes also use `expiresAt`; enable TTL for
the `items` and `audience` collection groups on that field so expired indexes are removed.

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
- Meeting passwords are verified by the authenticated backend using scrypt for new meetings.
  Legacy SHA-256 verifiers remain server-only until migrated and successfully upgraded; the
  rollout sequence above is required before deploying the protected-meeting changes.
- New Spot feeds are capped at 30 direct-chat/group contacts and use per-viewer Firestore feed
  entries whose relationship is checked on read and write. Existing Spots have no feed entries,
  so non-authors cannot read them after the new rules are applied; old media paths are denied to
  non-authors as well. These legacy Spots expire naturally after 24 hours.
- Chat and group Storage objects now require current conversation membership, are limited to
  encrypted `application/octet-stream` uploads with a 50 MiB plaintext cap (plus the AES-GCM tag),
  and are downloaded through the authenticated Storage SDK. Previously issued Firebase
  download-token URLs for attachments and legacy Spot media remain bearer links until revoked;
  existing objects need a controlled Admin SDK token-revocation migration before link-level
  revocation can be guaranteed. No such migration has been run.
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
