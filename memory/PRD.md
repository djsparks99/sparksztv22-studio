# PRD — Pirate Radio Live

## Original Problem Statement
Build a live video streaming platform where users can register, create their own channel, get a personal Livepeer stream key, and broadcast live.

- **users** collection: uid, email, display_name, username, photo_url, bio
- **channels** collection (1:1 with user): channel_id, user_ref, stream_key (private), playback_id (public), stream_title, category, is_live, viewer_count, last_updated

Feb 2026 — Follow-up: automatic Livepeer stream provisioning on sign-up, broadcaster dashboard exposes stream_key + RTMP ingest URL.

## User Personas
- **Broadcaster** — underground DJ / pirate radio operator who wants a channel URL, a stream key for OBS, and a public playback page.
- **Listener** — visits the site, browses live channels by genre, opens a channel page and watches the HLS stream.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB). All routes under `/api`. JWT Bearer auth (HS256, 7-day access token) stored in `localStorage` on the client.
- **Frontend**: React 19 + React Router 7. Tailwind (sharp corners globally overridden). Cabinet Grotesk display font + JetBrains Mono. HLS.js for playback.
- **Livepeer Studio** — stream lifecycle. On register, backend calls `POST https://livepeer.studio/api/stream` with 720p @3Mbps + 480p @1.6Mbps profiles; stores `streamKey`, `playbackId`, `id` on the channel document.
- **Emergent Object Storage** — profile avatars. Uploads stored at `pirateradio/avatars/{uid}/{uuid}.{ext}`; served via `/api/files/{path}` proxy.

## Implemented — Feb 2026
- Auth: register/login/me endpoints, bcrypt hashing, unique email + username indexes.
- Auto Livepeer stream provisioning at register; rollback of user doc on Livepeer failure.
- Channels: `GET /api/channels` (filters: `category`, `live_only`), public `GET /api/channels/{username}` (no stream_key), private `GET /api/channels/mine` (stream_key + RTMP URL exposed).
- Channel edits: title + category (validated against 10-genre allowlist).
- Go-live toggle + real Livepeer `isActive` sync endpoint.
- Viewer count increment via `POST /api/channels/{username}/view` (only when live).
- Profile: PATCH display_name + bio (mirrored to channel doc), photo upload with 5MB image validation.
- Categories endpoint returns the 10 music genres.
- Frontend routes: `/` (Browse hero + grid + marquee), `/login`, `/register`, `/channel/:username` (HLS player when live, OFF AIR panel otherwise), `/dashboard` (masked stream key + reveal/copy, RTMP url, playback URL, go-live toggle, title/category editor, Livepeer sync), `/profile` (avatar upload, display_name/bio).
- Design: brutalist warehouse-rave aesthetic — deep void black, acid yellow (#E5FF00), signal red LIVE badges, JetBrains Mono terminal UI, grain overlay, marquee category ticker.
- Testing: 17 backend pytest + 14 Playwright flows — all passing. See `/app/test_reports/iteration_2.json`.

## Backlog
### P1
- Livepeer webhook handler to auto-flip `is_live` when RTMP ingest starts/stops (currently manual toggle or `/sync` polling).
- Follow / favorite channels + a "following" tab on Browse.
- Chat sidebar on channel page (websocket).
- Password reset flow.

### P2
- Recording / VOD replays (Livepeer supports it; currently disabled).
- Category pages with SEO metadata.
- Broadcaster analytics (stream duration, peak viewers, historical uptime).
- Custom thumbnails per channel.
- Rate limiting on `/api/auth/register` (each call hits real Livepeer).

## Env / Keys
- `LIVEPEER_API_KEY` — set in `backend/.env`
- `EMERGENT_LLM_KEY` — used for object storage init
- `JWT_SECRET` — 64-char hex
- `MONGO_URL` / `DB_NAME` — pre-provisioned

## Test Credentials
See `/app/memory/test_credentials.md`.
