# trimi.app

A small video editor. One file in, one file out.

---

## 1. Product definition

**What it is:** a single window utility for the five edits people actually need before sending a video somewhere: cut it, reframe it, mute it, speed it up, fix the exposure.

**What it is not:** a timeline editor. No multitrack, no transitions, no text overlays, no filters with names like "Vintage Dream", no project files, no library.

**Target user:** anyone who opens iMovie to trim ten seconds off a clip and closes it again in frustration.

**Success criteria:** a user drags in a file, makes one edit, exports, and never opens a menu.

---

## 2. Delivery strategy

Two phases, same product:

| | Phase 1 — Web | Phase 2 — Native macOS |
|---|---|---|
| Goal | Ship the UX and the edit pipeline fast, at trimi.app, in a browser | Ship the polished, distributable Mac app |
| Status | In progress — UI shell and live-editing preview built | Not started |
| Why | No Xcode/signing overhead to iterate; instantly shareable; validates the five edits and the layout before committing to native code | Needed for HEVC/ProRes, hardware-accelerated 4K performance, and an installable, offline .dmg |
| Engine | Browser `<video>` for preview, WebCodecs + a muxer for export | AVFoundation + Core Image |

**What stays constant across both phases:** the product definition above, the `EditState` shape (trim / crop / speed / mute / color), and the one rule that matters — **preview and export must be driven by the same edit pipeline.** In native this means one `Compositor.make(source:state:)` feeding both the player and the exporter. In web it means the export path (WebCodecs + canvas/WebGL filters) must be validated against what the CSS-filter preview shows, not just built to "look about right" — CSS filters are a fast approximation for phase 1's preview, not the real pixel pipeline, and that gap is the most likely source of "the export doesn't match what I saw" bugs. Track it as a known trap, not a detail to fix later.

Phase 2 is a rewrite of the edit engine, not of the product decisions — the UI, the five tools, and the UX validated in phase 1 carry over directly.

---

## 3. Phase 1 — Web app

### 3.1 Technical decisions

| Area | Decision | Reason |
|---|---|---|
| Language / UI | TypeScript, React 19, Vite | No SSR/routing needed — it's a client-side tool, not a site. Vite keeps iteration fast |
| Preview engine | HTML5 `<video>` element, CSS filters for color, CSS `object-fit`/`aspect-ratio` for crop | Real playback, real `playbackRate`/`preservesPitch`/`muted`, zero dependencies |
| Export engine | [mediabunny](https://mediabunny.dev) (WebCodecs, wraps demux/decode/encode/mux behind one API + a `Conversion` API that covers trim/crop/mute declaratively) | `mp4-muxer` (originally planned) is deprecated by its own author in favour of mediabunny — same author, same WebCodecs/hardware approach, less boilerplate. Still explicitly not ffmpeg.wasm |
| Input formats | Whatever the browser decodes natively (mp4/mov vary by browser) | No transcoding step before load |
| Output formats | mp4 (H.264), gif | HEVC/ProRes are not achievable in-browser — that's a phase 2 feature, be upfront about it in the UI |
| Deployment | Editor: static site at editor.trimi.app, gated by a license check that runs entirely client-side. Landing + payments: separate app at trimi.app. See §5 | The editor itself still needs no backend and files never leave the browser — see §5 for why the license gate doesn't change that |

### 3.2 Architecture

```
app/
  src/
    App.tsx                 layout: header, video stage, timeline + toolbar
    types.ts                EditState, ColorAdjustments, CropPreset — mirrors the native EditState shape
    hooks/
      useVideoEditor.ts      single source of truth: file, EditState, playback, all mutations
    components/
      DropZone.tsx           drag-and-drop / file picker, empty state
      VideoStage.tsx         video element, crop preview, color filter preview, play/pause
      Timeline.tsx           real filmstrip (canvas-captured thumbnails), draggable trim handles, playhead
      Toolbar.tsx             floating toolbar (Crop / Speed / Mute / Color) + popovers
    lib/
      thumbnails.ts          generates real filmstrip thumbnails via a hidden video + canvas
      format.ts               time formatting
```

`useVideoEditor` is the phase-1 equivalent of the native `EditState` + `Compositor`: every control reads and writes through it, nothing mutates the video element directly from a component.

### 3.3 Known traps (phase 1 specific)

1. **Preview accuracy vs. export accuracy — resolved by reuse, not reimplementation.** CSS `filter: brightness()/contrast()/saturate()` is a rough stand-in for exposure/contrast/saturation, and the temperature control is a blend-mode overlay hack — none of this is the real pixel math. Rather than reimplementing that math in a canvas/WebGL pass for export (which reintroduces the drift risk this trap is about), the export pipeline reuses the exact same code: `lib/colorFilter.ts`'s `colorFilterCss()` produces the CSS filter string already used by the live preview, and the export's per-frame canvas pass sets `ctx.filter` to that same string (Canvas2D's `ctx.filter` accepts CSS filter syntax and runs the same underlying implementation) before drawing each frame, then replays `temperatureOverlayStyle()`'s overlay the same way. Preview and export are then provably identical, because there is only one implementation of the math. The magic numbers inside `colorFilter.ts` (exposure gain, overlay alpha cap, the two overlay colors) should be named constants so neither path can be tuned independently of the other. This locks in "the CSS approximation" as the actual look, which is fine for phase 1 — phase 2's Core Image pipeline should match these curves deliberately, not accidentally.
2. **Browser support is uneven.** WebCodecs works well in Chrome and reasonably in current Safari; older Safari and Firefox lag. Feature-detect and fail honestly rather than silently producing a broken export.
3. **No hardware HEVC/ProRes.** Don't imply otherwise anywhere in the UI — mp4/H.264 and gif are the ceiling for phase 1.
4. **Large files in-browser.** Everything happens in memory/blob URLs; very large source files can hit browser memory limits. Not a phase-1 blocker, but don't assume it scales to arbitrary file sizes without testing.

### 3.4 Export engine, as built (W2)

Lives at `app/src/lib/export-engine/` (named to avoid colliding with the pre-existing `lib/export.ts`, which still holds the size/estimate/format helpers shared with the UI). Loaded via dynamic `import()` from `Sidebar.tsx`, only once the Export tab is opened — mediabunny + the SoundTouch worklet are ~500KB, and the common edit-only session shouldn't pay for them.

**Library: [mediabunny](https://mediabunny.dev), not mp4-muxer.** `mp4-muxer`, named in §3.1's original decision, is deprecated by its own author in favour of mediabunny (same author, same WebCodecs/hardware-encode approach, far less boilerplate — it wraps demux/decode/encode/mux behind one API).

**Why the custom low-level pipeline instead of mediabunny's `Conversion.init()` convenience API:** `Conversion` directly supports trim, crop, and discarding the audio track, which covers three of the five edits declaratively. It does not support changing playback speed (no retiming knob), and speed needed custom timestamp math regardless — so rather than splitting the logic across `Conversion` for four edits and a separate custom path for the fifth, all five are done through one small hand-written pipeline (`mp4.ts`) using mediabunny's lower-level building blocks: `VideoSampleSink` to pull decoded frames, `CanvasSource`/`AudioBufferSource` to push encoded output. This also sidesteps needing any fixed frame-rate assumption — each frame's own real timestamp is individually rescaled by `1/speed`, so variable-frame-rate sources (trap in §4.4) are handled for free rather than needing special-casing.

**How each edit is actually implemented:**
- **Trim** — `VideoSampleSink.samples(trimStart, trimEnd)` bounds the frame iteration directly.
- **Crop** — the normalized `CropRect` converted to pixels against `videoTrack.getDisplayWidth/Height()` (the *display* dimensions, i.e. already rotation-corrected — solves trap §4.4.1's phone-video-rotation problem for free, since `VideoSample.draw()` also auto-applies rotation). Reuses the existing `croppedSize()`/`scaledSize()` helpers from `lib/export.ts` so the encoded resolution is exactly what the Size UI already predicts.
- **Color** — per §3.3 trap #1: `ctx.filter = colorFilterCss(edit.color)` before drawing each frame, then a second canvas pass replaying `temperatureOverlayStyle()`'s overlay (`globalCompositeOperation: 'overlay'` + the same hex colors/alpha). Same code as the live preview, not a reimplementation.
- **Mute** — simply never adds an audio track/source to the `Output`.
- **Speed** — video: each frame's timestamp/duration divided by `speed` as it's fed to `CanvasSource.add()`. Audio: the trimmed range is decoded into one `AudioBuffer` (`export-engine/audio.ts`), then either time-stretched with **real WSOLA pitch preservation** via `@soundtouchjs/audio-worklet`'s `processOffline()` (when `preservesPitch` is on — tempo changes, pitch doesn't, matching what `<video preservesPitch>` does natively in the live preview) or resampled via a plain `OfflineAudioContext` + `playbackRate` (varispeed — pitch shifts with speed) when it's off. This was flagged in the original consult as the item most likely to need a fallback (disable pitch preservation); it didn't — SoundTouch's offline API turned out to be a straightforward fit.

**Bitrate:** computed from the exact same bits-per-pixel-at-30fps constants already in `estimateExportBytes()` (`lib/export.ts`), so the size the Export tab predicts is a real prediction, not a guess. One real bug worth flagging for future maintainers: `mediabunny`'s `Quality` constructor treats a **bare number** as a *qualitative* 0–1 quality level, not a literal bitrate — passing a real bitrate (e.g. `300000`) that way is silently read as an absurd out-of-range quality value and can make capability checks fail unpredictably. The fix is the options-object form: `new Quality({ bitrate })`.

**Capability detection** (trap §3.3.2): `checkExportSupport()` feature-detects `VideoEncoder`/`OffscreenCanvas` plus a real `canEncodeVideo('avc', ...)` check, shown as an inline message rather than a silently broken export button.

**GIF export (W3).** A second pipeline (`gif.ts`) sharing `frame.ts` (crop/scale math) and `color.ts` (the same color pass) with the mp4 path, but sampling frames rather than forwarding every one: for each of `duration × fps` output frames (fps by quality: 15/12/8, matching `estimateExportBytes()`), it asks mediabunny for the nearest source frame via `VideoSampleSink.getSample(timestamp)` at the corresponding source timestamp (`trimStart + outputTime × speed` — the same per-frame retiming principle as the mp4 path, so speed changes and variable source frame rates are handled without special-casing), draws+color-grades it, then quantizes and encodes it with **[gifenc](https://github.com/mattdesl/gifenc)**. Encoding uses a **fresh local color palette per frame** (`quantize()` + `applyPalette()` on every frame, not just the first) rather than one global palette reused for the whole clip — this is the pattern gifenc's own reference example uses, and it matters: a palette computed once from frame one looks visibly worse as soon as color grading or scene content shifts over the clip. `ctx.getImageData()` is called every frame, so the canvas is created with `willReadFrequently: true` to avoid the GPU-readback penalty Chrome otherwise warns about. GIF has no audio track, so muting is implicit. Verified end-to-end (real browser, real files): correct frame count and dimensions, mid-clip frame visually clean, cancel works mid-encode.

No TypeScript types ship with gifenc — a small hand-written ambient declaration covering only the API surface used lives at `app/src/types/gifenc.d.ts`.

### 3.5 Phases

| # | Phase | Done when |
|---|---|---|
| W0 | Shell and preview | Drag and drop a file, it plays, layout matches the chosen design (floating toolbar over the timeline) — **done** |
| W1 | Trim, speed, mute, crop, color (preview only) | All five controls are live and backed by real video/CSS APIs — no fake state — **done** |
| W2 | Export engine | WebCodecs + muxer produces a real mp4 that reflects trim/speed/crop/color/mute exactly as previewed — **done** (`app/src/lib/export-engine/`; see §3.5) |
| W3 | GIF export | Canvas frame sampling into an animated GIF, capped size/duration like the native plan describes — **done** (`export-engine/gif.ts`; see §3.4) |
| W4 | Polish | Real audio waveform, loading/error states, responsive layout, keyboard shortcuts |
| W5 | Ship | Deployed at trimi.app |

---

## 4. Phase 2 — Native macOS app

### 4.1 Technical decisions

| Area | Decision | Reason |
|---|---|---|
| Language / UI | Swift 6, SwiftUI | Native, small binary, no runtime to ship |
| Media engine | AVFoundation only | Covers every required feature. No external binaries |
| Color processing | Core Image (CIFilter) | GPU accelerated, same code path for preview and export |
| Input formats | mp4, mov, m4v | Whatever macOS decodes natively |
| Output formats | mp4 (H.264), mov (HEVC, ProRes), gif | Hardware encoders via VideoToolbox |
| Deployment target | macOS 14 | SwiftUI is stable enough there, covers most machines |
| Bundle ID | `app.trimi.Trimi` | Matches the domain |
| Distribution | Signed and notarized .dmg, self hosted | Developer ID account is active |
| Updates | Sparkle 2 with EdDSA signing | Standard for non App Store Mac apps |

**Deliberately excluded:** ffmpeg. Input scope is mp4 and mov only, so the 40 MB, the LGPL build, the child process signing and the entitlements buy nothing. The export layer is still written behind a protocol so it can be added later without touching the UI.

### 4.2 Architecture

```
trimi/
  App/            entry point, window, commands
  Model/          VideoSource, EditState, ExportSettings
  Compositor/     builds AVComposition + AVVideoComposition from EditState
  Export/         ExportEngine protocol, AVFoundation engine, GIF engine
  UI/             player, timeline, inspector panels
  Distribution/   Sparkle setup, release scripts
```

#### The one rule that matters

`Compositor.make(source:state:)` returns the composition used by **both** the preview player and the exporter. Never build them separately. The moment there are two code paths, the preview stops matching the output and every bug becomes a guessing game.

#### Core types

```swift
struct VideoSource {
    let url: URL
    let asset: AVAsset
    let duration: CMTime
    let naturalSize: CGSize      // after applying preferredTransform
    let frameRate: Float
    let hasAudio: Bool
}

struct EditState: Equatable, Codable {
    var trim: ClosedRange<Double>      // seconds
    var crop: CGRect                    // normalized 0...1, nil rect = full frame
    var speed: Double                   // 0.25 ... 4.0
    var isMuted: Bool
    var preservesPitch: Bool
    var color: ColorAdjustments
}

struct ColorAdjustments: Equatable, Codable {
    var exposure: Double    // -2 ... 2      CIExposureAdjust
    var contrast: Double    // 0.5 ... 1.5   CIColorControls
    var saturation: Double  // 0 ... 2       CIColorControls
    var temperature: Double // -1 ... 1      CITemperatureAndTint
}

protocol ExportEngine {
    func export(source: VideoSource, state: EditState,
                settings: ExportSettings,
                progress: @escaping (Double) -> Void) async throws -> URL
}
```

`EditState` being `Codable` costs nothing now and gives free presets later. This is the same shape the web app's `EditState` (in `app/src/types.ts`) is deliberately kept close to.

### 4.3 How each feature is implemented

**Trim.** Set `timeRange` on the export session. Preview clamps the player to the same range. Cheap, lossless in position, no re-encode of what falls outside.

**Speed.** `AVMutableCompositionTrack.scaleTimeRange(_:toDuration:)` on both video and audio tracks. Set `audioTimePitchAlgorithm` to `.spectral` when pitch is preserved, `.varispeed` when it is not. Apply the same value on `AVPlayerItem` for preview.

**Mute.** Do not insert the audio track into the composition. Nothing to strip, nothing to encode.

**Crop and color.** Both happen inside one `AVVideoComposition(asset:applyingCIFiltersWithHandler:)`. Chain `cropped(to:)` and the color filters on the same `CIImage`, then translate the result back to the origin.

> Do not combine `setTransform` on a layer instruction with a CIFilter composition. Mixing the two produces black frames and hours of confusion. Crop inside the filter handler.

**Export.** Phase one uses `AVAssetExportSession`, which accepts `videoComposition`, `timeRange` and `audioMix` directly. When real bitrate control is needed, swap in `AVAssetReaderVideoCompositionOutput` plus `AVAssetWriter` behind the same protocol.

**GIF.** `AVAssetImageGenerator` sampling at 10 to 15 fps into `CGImageDestination` with `kUTTypeGIF`. Cap the output at 640 px wide and warn above 10 seconds, otherwise the file is larger than the video was.

### 4.4 Known traps

1. **`preferredTransform`.** Ignore it and every video shot on a phone exports sideways. Read it once when loading the source and bake it into `naturalSize` and the compositor.
2. **HDR footage.** Modern iPhone clips are HLG or Dolby Vision. Passing them through a plain CIFilter chain washes them out badly. Set `colorPrimaries`, `transferFunction` and `yCbCrMatrix` explicitly on the composition, or tone map to Rec.709 and be honest about it in the UI.
3. **Preview performance.** Do not run the filter chain at 4K just to fill a 900 px player. Downscale the `CIImage` to display size in the preview path only.
4. **Variable frame rate.** Screen recordings often carry VFR. Speed changes on VFR sources drift out of sync. Detect it and normalize to CFR on import.

### 4.5 Distribution pipeline

One script, run once per release, no manual steps:

1. `xcodebuild archive` with hardened runtime enabled
2. `codesign` with Developer ID Application, deep, timestamped
3. `xcrun notarytool submit --wait`
4. `xcrun stapler staple`
5. `create-dmg` with custom background and the Applications alias
6. Sign the .dmg as well
7. Generate the Sparkle EdDSA signature and update `appcast.xml`
8. Upload the .dmg and the appcast

Hosting: .dmg on object storage behind Cloudflare, appcast served from the same domain.

### 4.6 Phases

| # | Phase | Done when |
|---|---|---|
| N0 | Project setup | Xcode project builds, signs locally, repo initialized |
| N1 | Model and compositor | An `EditState` produces a correct output file from a unit test, no UI at all |
| N2 | Shell and preview | Drag and drop a file, it plays, window chrome is right |
| N3 | Timeline and trim | Two handles, frame accurate scrubbing, keyboard nudge |
| N4 | Crop, speed, mute | Ratio presets, live preview, all three combine correctly |
| N5 | Color | Four sliders, live preview, reset button, no dropped frames |
| N6 | Export | Format presets, progress, cancel, reveal in Finder |
| N7 | Release | Notarized .dmg installs cleanly on a machine that has never seen the app |
| N8 | Landing and updates | trimi.app serves the download, Sparkle detects a test update |

N1 before any interface work. If the export is correct, the rest is painting. If it is not, no amount of painting helps.

N0 to N6 produce something usable. N7 and N8 are what turn it into a product, and they always take longer than they look.

---

## 5. Launching phase 1: licensing, payments & hosting

trimi is a one-time €20 purchase, lifetime access, sold at trimi.app. The paid product is served at editor.trimi.app — this repo. No accounts, no login, no user database — just one small per-order record used to enforce a single active device (§5.2). This section is the plan for that; it was drafted with input from a dedicated architecture consult (Opus) and adapted to self-hosting on the founder's own server via Coolify instead of a managed edge platform, then revised from a fully-offline unlimited-device scheme to the single-seat model after weighing the sharing risk of the former.

### 5.1 Scaling: why this doesn't need to scale in the usual sense

Every edit and export runs on the buyer's own machine, in their own browser — the source file never leaves it (per §3.1). That means there is no shared server-side resource for concurrent users to contend over:

- **editor.trimi.app** is a directory of static files. It has no server-side code and no secrets at all (see §5.2). Ten users and ten thousand differ only in bandwidth.
- **trimi.app**'s backend runs a handful of tiny handlers (mint a code, receive the Stripe webhook, bind/unbind a device seat, look up a lost code) against a single-field record per order — each purchase triggers each one a handful of times, ever. This is not "scales fine," it's "barely exists."
- **Continued use has zero server dependency.** Once a browser is bound, every later visit — including export — is a local signature check, no network call.

The real constraints are per-user, not concurrency: a very large source file can exhaust one tab's memory regardless of how many other people are using trimi that minute (§3.3 trap 4), and WebCodecs support varies by browser (§3.3 trap 2). Neither has anything to do with traffic volume.

### 5.2 Licensing: a signed activation code, bound to one active device at a time

**There is no login and no user database.** This is the key thing to understand about how it works, because "an account" and "a code that unlocks a lock screen" (both raised as options) sound similar but aren't — we're doing the second one, and it's worth being explicit about why. There is exactly one small piece of server-side state per purchase — see §5.2.2 — and nothing resembling a users table.

**How it works, end to end:**

1. Buyer pays €20 once via Stripe on trimi.app.
2. A small server-side function (running on the founder's own server via Coolify, not a third-party platform) mints an **activation code** — a short string, cryptographically signed with a private key only that server knows.
3. The buyer gets an **activation link** (`https://editor.trimi.app/#k=<code>`) on the Stripe success page and by email. Clicking it opens the editor.
4. The editor checks the code's signature using a **public key baked into the app itself** (public keys are safe to ship — that's the point of signing vs. a plain password), then asks the same small server whether this purchase's one "seat" is free. If it is, the seat is bound to this browser and the editor unlocks. If it's already bound to a different browser, the buyer sees *"This code is active on another device — unlink it there first"* instead of unlocking.
5. Once bound, the editor remembers the code in that browser's `localStorage` and doesn't re-check the seat on every visit — only the initial activation (and the unlink action, §5.2.1) talk to the server. Normal use, including export, has no network dependency at all.

**Only one active browser/device per code, on purpose — and why that's actually the anti-sharing mechanism, not a limitation.** A code shared publicly can still be *pasted* anywhere, but only one browser can hold the seat at a time — the moment a second person activates it, the first person's browser is no longer the bound one next time it needs to re-bind (e.g. after clearing site data). Two people trying to use one code becomes an annoying tug-of-war, not a free multiplier, without needing to detect or police anything. Legitimate single-owner use (one person, one browser at a time) is completely unaffected.

**Moving to a new browser or computer — the "user" panel.** The existing (currently inert) account icon in the header (`App.tsx`, the `IconUserCircle` affordance) becomes this purchase's status panel — not a login, just a local view of "your code" plus one button: **Unlink this device**. Clicking it releases the seat server-side and clears this browser's local state, so the code can be activated somewhere else immediately, forever, with no limit on how many times you move it — you just can't be active in two places simultaneously.

**The edge case: you lose access to the old device before unlinking** (it broke, was wiped, etc.). This reuses the same "lost code" recovery flow already planned for a forgotten code (§5.2.2): the founder (or an automated email-confirmation step, if that's added later) verifies the buyer via the email Stripe has on file and force-clears the seat, exactly like resetting a password reuses an email-verification flow elsewhere. No new mechanism, same recovery path serving two purposes.

**Why not a real account (email + password, or magic link)?** That would need a server-side database of who-owns-what and a session/login system to check on every visit — precisely the "big database, complex stuff" ruled out from the start. The single-seat signed-code approach gets a meaningfully anti-shareable result without either.

#### 5.2.1 The gate, concretely

- App loads → checks for `#k=...` in the URL (fresh activation) or a previously bound code in `localStorage`.
- Bound + this browser holds the seat → the editor renders exactly as it does today, no network calls.
- Locked → instead of the drop zone, show: *"Trimi is a one-time €20 purchase."* One input that accepts either the full activation link or the bare code (paste either, it figures out which), a primary **Activate** button, a secondary **Buy trimi — €20** link to trimi.app, and "Lost your code? / Used on another device?" linking to a recovery page on trimi.app.
- This is a UX + light anti-sharing gate, not DRM. Someone determined enough could still strip the check from the downloaded JS bundle — true of any client-side check — but that's not the threat model here; the single-seat binding is aimed at casual sharing, not a determined attacker, and that's a deliberate, proportionate line for a €20 utility.

#### 5.2.2 What the code actually contains, and the one piece of state that does exist

The activation code is `payload + signature`, base64-encoded. The payload is small: a format/version byte, an order reference, and the date issued. The order reference is **derived from the Stripe checkout session id** (a one-way hash of it), not a random id — so the code itself never needs to be stored anywhere; Stripe already has the record of who paid (session id, email, receipt).

The **one thing that is stored**, server-side, per purchase: which device currently holds the seat — one row per order, one nullable field (`orderRef → boundDeviceId`), where `boundDeviceId` is a random token the browser generates on first activation and keeps alongside its copy of the code. That's the entire server-side data model. No user table, no auth, no sessions — just "is this seat free, and if so, whose is it now."

- "I lost my code": find the buyer's email in Stripe, recompute the same code from their session id, resend it — same code every time, no lookup table needed for this part.
- "My code says it's active elsewhere and I don't have access to that device": the same recovery contact clears `boundDeviceId` back to null.

**Refunds/chargebacks:** no separate revocation mechanism at launch. Clearing `boundDeviceId` (or, if ever needed, a small "these order refs are revoked" list checked only at activation, failing open on any server error) is enough — a refunded buyer keeping access to a client-side video trimmer costs nothing, so there's no urgency here beyond what the seat binding already provides.

**One irreversible artifact:** the private signing key. It's generated once, offline, and never leaves the founder's own machine/server. Losing it means all future codes need a new key pair (old codes still verify against the old public key, so nothing already sold breaks — the app can ship checking against a small list of valid public keys over time). Back it up somewhere durable (password manager), same as any other secret that can't be regenerated.

### 5.3 Hosting: self-hosted via Coolify, two separate deployments

The founder runs their own server with Coolify already, so that's the platform — no Cloudflare/Vercel needed. The important architectural point carries over regardless of platform: **editor.trimi.app and trimi.app are two separate deployments, not one app with two routes**, so that:

- The editor has **no backend and no secrets at all** — it's a static build (`app/dist`) served as its own Coolify app/static site. Nothing in it can leak the signing key, because it was never given the signing key.
- If trimi.app's small backend service has a bad deploy, a crash, or needs a restart, **editor.trimi.app keeps working for every customer who already has a code** — it doesn't depend on that service being up at all, only on it having been up once, in the past, to mint their code. This is what makes "the app shouldn't go down" true architecturally rather than by luck.
- Deploys are independent: a landing-page copy fix doesn't touch the editor; an export bugfix doesn't touch the page that takes payments.

Concretely, two Coolify apps from the same repo:

| Coolify app | Domain | Repo path | What it runs |
|---|---|---|---|
| `trimi-editor` | editor.trimi.app | `app/` | Static build output (`npm run build` → `app/dist`), served as static files. No server process needed beyond a static file server. |
| `trimi-site` | trimi.app (+ www) | `site/` | The landing page (static) plus a small Node service for: mint a code after Stripe confirms payment, receive Stripe's webhook, bind/unbind a purchase's device seat, and look up a lost code by email. Backed by a single SQLite file (one row per order: order ref → bound device id) — no separate database service to run. This is the only place secrets live (Stripe key, the signing private key, an email-sending key) and the only place the SQLite file lives. |

Since it's self-hosted, note the one real trade-off versus a managed edge platform: uptime for `trimi-site` (and therefore new sales and code recovery) is now the founder's own server's uptime, not a CDN's. That's an acceptable trade for using infrastructure already owned and paid for — just worth Coolify's restart policies / health checks being turned on for `trimi-site`, and DNS for both subdomains pointed at the server (Coolify's built-in proxy handles TLS certificates automatically once that's done).

### 5.4 Repo structure: one GitHub repo

There's no git repository at all yet under `/Users/tormius/dev/trimi`. Plan: one **private** GitHub repo (private because `site/` will contain the payment backend — no reason to make that code public even though the editor bundle itself is inherently public once deployed), holding everything:

```
trimi/
  package.json               npm workspaces: app, site, packages/license
  .gitignore
  TRIMI-PLAN.md
  design/
  packages/license/          the ONE module that signs codes (used by site/) and verifies them (used by app/) — shared, so the two sides can never drift apart into "signed with one scheme, checked with another"
  app/                       this editor, unchanged, deployed as trimi-editor
  site/                      landing page + the payment/licensing backend (+ its SQLite file), deployed as trimi-site
```

`packages/license` is the one piece of shared code between the two deployments, and it's small and stable (encode/decode/sign/verify) — worth keeping in the same repo specifically so it can't quietly diverge between the app that mints codes and the app that checks them.

### 5.5 Sequenced launch checklist

1. **Repo + editor deployed, ungated** — `git init`, push to GitHub, stand up `trimi-editor` on Coolify pointed at `app/`, confirm editor.trimi.app loads and plays a video from the real deployment. Do this first; it's cheap and everything else builds on having a working deploy target.
2. **Export engine (the actual remaining product work)** — mediabunny-based mp4 export covering trim/crop/mute/color (via the `ctx.filter` reuse in §3.3) and speed (custom — video timestamp scaling plus an `OfflineAudioContext` render for the audio, real time-stretching only if `preservesPitch` needs to stay true at non-1x speeds). Verify a preview frame and an exported frame match. This is the one item that's genuinely a project rather than a task — everything else in this section is comparatively quick.
3. **Licensing plumbing** — generate the signing key pair (offline, back it up), build `packages/license`, add the SQLite-backed seat store and its endpoints (activate/bind, unlink, lost-code lookup) to `site/`, add the activation gate + the user panel's "unlink this device" action to the editor.
4. **Commerce + landing** — Stripe product + Payment Link (no custom checkout code needed) for the €20 one-time charge, webhook wired to mint + email the code, a `/thanks` success page and a `/recover` page (lost code, or "used on another device" self-service help), VAT/Stripe Tax handling for selling a digital product to the EU, a plain refund policy.
5. **Pre-launch gate** — buy the product for real, with a real card, in live mode; follow the activation link; confirm it unlocks and binds this browser; export a real file; paste the same code into a second browser and confirm it's correctly refused ("active on another device"); use the unlink action from the first browser and confirm the second can now activate; confirm normal use (including export) works with the network off once already bound, since only activation/unlink should ever touch the server; then refund the test purchase and confirm nothing breaks. Also: the current layout is a fixed desktop grid, so add an honest "trimi needs a desktop browser" screen for mobile visitors rather than a broken layout.

**Launch-blocking:** the export engine, the activation gate + seat binding + payment flow working end to end in live mode, the unlink action, VAT handling, the desktop-only mobile screen, some way to recover a lost/stuck code (even if it's just the founder doing the Stripe lookup and seat-clear by hand at first).
**Not launch-blocking:** GIF export (if it's not ready, hide the toggle rather than ship a button that fails), a public revoked-order-refs list beyond the seat-clear on refund, raising the seat limit above one, audio waveform, keyboard shortcuts.
