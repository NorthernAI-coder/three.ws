# IBM community webinar — runbook (Jun 23, 2026)

The webinar stage lives at the top of **[pages/ibm/x402-demo.html](../../pages/ibm/x402-demo.html)** — the same page hosts the live x402 demos below it, so attendees watch the talk and try the demos on one screen. It is fully self-contained, so it runs verbatim when published to **live.ibm.com** as well as `three.ws/ibm/x402-demo`.

Everything is driven by one config object: the `WEBINAR = { … }` block inside the page's webinar `<script>` (search the file for `SET THE REAL START TIME`).

---

## 1. Today — set the start time (the only required value)

In the `WEBINAR` config:

```js
startTime: '2026-06-23T15:00:00Z',  // ISO 8601, Z = UTC. Default = 11:00 AM US Eastern.
durationMin: 60,                    // talk length → when the stage flips to "replay"
```

Set `startTime` to the real slot and `durationMin` to the real length. With no video source yet, the page shows a **live countdown** + Add-to-Calendar. Nothing else is needed to ship the countdown.

---

## 2. When the video is ready — paste ONE source

Still in `WEBINAR`. Fill exactly one; resolution priority is `liveHls → vodHls → mp4 → youTubeId`.

```js
liveHls: '',     // OBS → ingest → HLS (.m3u8) live feed     → set mode:'live'
vodHls:  '',     // Cloudflare Stream / Mux HLS (.m3u8)        → synced premiere
mp4:     '',     // plain MP4 on R2                            → synced premiere
youTubeId: '',   // YouTube video / live id                    → iframe
mode: 'auto',    // 'auto' | 'premiere' | 'live'
```

A **premiere** (`vodHls`/`mp4`) plays the recording seeked to wall-clock — everyone sees the same moment, latecomers join in progress, no skipping ahead. A **live** source streams straight through. No code changes; the stage swaps from countdown to player on its own at `startTime`.

### Option A — Cloudflare Stream (recommended)
You're already on Cloudflare/R2, and one product does both VOD and live.

- **Pre-recorded premiere:** Stream dashboard → **Videos** → upload the recording → open it → copy the **HLS manifest** URL (ends in `.m3u8`) → set `vodHls`.
- **Live from OBS:** Stream → **Live Inputs** → **Create Live Input**. Copy:
  - the **RTMPS** URL + **Stream Key** → OBS ▸ Settings ▸ Stream (Service: *Custom*), or the **SRT** URL for lower latency;
  - the input's **HLS playback** URL (`.m3u8`) → set `liveHls` and `mode: 'live'`.
- **OBS encoder:** 1080p, 30fps, x264, keyframe interval **2s**, bitrate 4000–6000 kbps. Start streaming a few minutes early to warm the input.

### Option B — Plain MP4 on R2 (zero new service)
Record → export an MP4 (1080p, H.264/AAC, web-optimized / faststart) → put it on R2 → set `mp4` to its public URL (`${S3_PUBLIC_DOMAIN}/<key>`). Premiere works identically; you only lose adaptive bitrate and the live option. *(Ask Claude to upload it via the existing R2/S3 credentials and hand back the URL.)*

### Option C — YouTube (fastest, least control)
Create an unlisted video / Premiere / Live event → set `youTubeId` to the id. Renders as an iframe (carries YouTube chrome).

---

## 3. Verify before going live

Open the page with **`?wb=live`** appended to the URL:

```
https://three.ws/ibm/x402-demo?wb=live
```

This force-mounts the player immediately (ignoring the clock) using whatever source is configured, so you can confirm it plays, audio works, and the unmute button behaves — **before** the event. Other QA overrides: `?wb=countdown`, `?wb=premiere`, `?wb=ended`. Remove the param for the real run.

If the source is unreachable, the stage shows a designed **"Playback hit a snag"** card with a Reload button rather than a black frame.

---

## 4. Day-of checklist

- [ ] `startTime` / `durationMin` correct for the real slot + timezone.
- [ ] One source set; opened `?wb=live` and confirmed playback + audio.
- [ ] Page deployed to `three.ws/ibm/x402-demo` **and** published on live.ibm.com.
- [ ] (Live) OBS connected to the ingest and streaming ~5 min early.
- [ ] Calendar links resolve (Google + .ics download).
- [ ] After the talk: leave `vodHls`/`mp4` set so the stage auto-flips to on-demand replay.

---

## Deploy notes

It's a static page — publish like any other. In this repo, push to **both** remotes (`threeD` and `threews`) so both deploy targets stay in sync. The webinar block adds no new build step and no server dependency.
