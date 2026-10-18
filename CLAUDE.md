# Afterglow: project handoff

Afterglow is a personal Spotify player web app. It plays the owner's real
Spotify music through Spotify's official Web Playback SDK, with a custom look
inspired by the open-source app "Liner" (tryliner.fun), minus Liner's
YouTube-ripping backend. It runs entirely in the browser: no server, no
database, no secrets.

## The owner

- Dylan, a student and small business owner. Not a professional developer.
- Comfortable with GitHub's web editor and GitHub Pages (he hosts his business
  site there), not with the command line.
- Wants changes committed and published for him automatically.
- Communication: short, direct explanations. Never use em dashes.
- He has Spotify Premium and uses Chrome/Edge on a computer.

## Your job in this repo

When Dylan asks for a change:

1. Make the change in `src/`.
2. Run `npm run build` (this also type-checks). Fix any errors.
3. If the change is visual, preview it with `?demo` (see Testing) and look at it.
4. Add an entry to `CHANGELOG.md` (newest first, under today's date, plain
   language Dylan understands, no jargon). Dylan asked for every update,
   however small, to be tracked there.
5. Commit with a short, plain message and push to `main`.
6. The GitHub Action in `.github/workflows/deploy.yml` builds and publishes the
   site to GitHub Pages. Tell Dylan it'll be live in about a minute.

Don't commit `node_modules/` or `dist/` (both are in `.gitignore`).

## Hosting and deployment

- Hosted on GitHub Pages at https://dh649.github.io/afterglow/ (repo
  `dh649/afterglow`, public). Pages source is set to GitHub Actions, and the
  migration from hand-uploaded files is done.
- Cloud sandboxes usually can't open github.io. Confirm deploys through the
  Actions run status, and ask Dylan to check the live site (or to allow
  `dh649.github.io` in claude.ai Settings > Capabilities).
- The Spotify redirect URI is the exact page address, e.g.
  `https://<user>.github.io/afterglow/`. Don't change the repo name or the
  path without telling Dylan; login breaks until he updates the Spotify
  dashboard.

## Commands

    npm install
    npm run dev      # http://127.0.0.1:5173 (Spotify requires 127.0.0.1, not "localhost")
    npm run build    # tsc --noEmit, then vite build to dist/
    npm run preview

The build produces ONE self-contained `dist/index.html` (via
`vite-plugin-singlefile`) plus `manifest.webmanifest` and `icon.svg` from
`public/`. `base: "./"` keeps paths relative so it works in a subfolder.

## Testing

- `?demo` in the URL (e.g. `http://127.0.0.1:5173/?demo#/`) runs the whole UI
  with made-up music, covers, and lyrics, no login. All data comes from
  `src/lib/demo.ts`. Use it for screenshots (Playwright works well).
- Real Spotify playback can't be tested without Dylan's login. Ask him to try
  it and send a screenshot when a change touches playback or the API.
- Google Fonts may fail to load in sandboxes; that's fine.

## Tech stack

React 19, TypeScript (strict), Vite 7, plain CSS (`src/styles.css`). No UI
library, no router library, no state library. Dependencies are intentionally
minimal: react, react-dom, and build tools only.

## File map

    index.html                  Shell, Google Font (Schibsted Grotesk), manifest link
    vite.config.ts              Single-file build, relative base
    public/manifest.webmanifest Lets Chrome/Edge "install" it as an app
    public/icon.svg             App icon (glowing ring)
    lyrics-relay-worker.js      Optional Cloudflare Worker for lyrics search (see Lyrics)
    src/main.tsx                Finishes Spotify login redirect, then renders <App>
    src/App.tsx                 Shell: background, sidebar, routes, player bar,
                                now-playing overlay, theme vars, keyboard shortcuts
    src/styles.css              All styles, tokens at the top

    src/lib/store.ts            Tiny observable store + useStore (useSyncExternalStore)
    src/lib/settings.ts         User settings, persisted to localStorage
    src/lib/auth.ts             Spotify PKCE login, token refresh, ?demo flag
    src/lib/spotify.ts          Spotify Web API client, types, all endpoints
    src/lib/player.ts           Web Playback SDK wrapper, player store, controls, demo player
    src/lib/lyrics.ts           LRCLIB lookup, LRC parser, matching logic
    src/lib/lastfm.ts           "For you" suggestions via Last.fm, matched back to Spotify
    src/lib/color.ts            Extracts accent/glow colors from album art
    src/lib/hooks.ts            Hash router, useAsync (cached fetch), useFrame, helpers
    src/lib/demo.ts             Demo fixtures and fake API responses
    src/lib/mediaSession.ts     Media keys + OS media popup (silent anchor audio, see Playback)

    src/components/Background.tsx      Living album-art canvas, wallpaper, dim, grain
    src/components/Sidebar.tsx         Nav + Playlists/Albums switch and list
    src/components/PlayerBar.tsx       Bottom bar, Timeline, Transport, Volume, DeviceNote
    src/components/QueuePanel.tsx      Right-hand queue drawer (Q), from /me/player/queue
    src/components/NowPlaying.tsx      Full-screen view: cover, controls, up next, lyrics
    src/components/Lyrics.tsx          Synced lyrics with per-word fill, offset control
    src/components/MiniPlayer.tsx      Floating always-on-top player (Document PiP)
    src/components/TrackList.tsx       Song rows, Artists links, Equalizer
    src/components/Tile.tsx, Shelf.tsx Cover tiles and horizontal rows
    src/components/CollectionHeader.tsx Playlist/album/artist header with color glow
    src/components/LikeButton.tsx      Save/unsave via /me/library
    src/components/Toast.tsx           Toasts + player error banner
    src/components/Icon.tsx            Inline SVG icon set

    src/pages/Home.tsx          Greeting, jump back in, For you, recently played,
                                on repeat, top artists, your playlists, your albums
    src/pages/Collections.tsx   Playlist, Album, Artist, Liked songs pages
    src/pages/Search.tsx        Search (songs, artists, albums, playlists)
    src/pages/Settings.tsx      All settings
    src/pages/Setup.tsx         First run: paste Client ID, log in

## How it works

### Login (src/lib/auth.ts)

Authorization Code + PKCE, client-side only. Dylan created his own app in the
Spotify developer dashboard and pastes its Client ID on first run (stored in
localStorage as `afterglow.clientId`). Tokens live in localStorage
(`afterglow.token`) and refresh automatically. `redirectUri()` is
`location.origin + location.pathname`. Scopes are listed in `SCOPES`.

### Routing (src/lib/hooks.ts)

Hash routes so GitHub Pages needs no config: `#/`, `#/search?q=`, `#/liked`,
`#/playlist/:id`, `#/album/:id`, `#/artist/:id`, `#/settings`. The OAuth
redirect comes back as `?code=` on the root, handled before render.

### Playback (src/lib/player.ts)

Loads `https://sdk.scdn.co/spotify-player.js` and registers the tab as a
Spotify Connect device named "Afterglow". `player_state_changed` feeds the
`player` store. Position is interpolated (`currentPosition()`) from `position` + `stamp`.
Play commands go through the Web API with `device_id`. `activateElement()` is
called before playing to satisfy browser autoplay rules.

Other devices (don't steal playback): on `ready`, `checkActiveDevice()` calls
`GET /me/player`. If another device is active, the store gets
`remote: { name, type }` plus that device's track/position, and nothing is
transferred. Only if nothing is playing anywhere does it `transfer(play:false)`
to load the last session here. While this tab isn't playing (`playingHere`
false, set from SDK states; a null SDK state means playback left), it polls
every 5s if the remote is playing, 15s otherwise, 30s when hidden, and again on
window focus. Controls branch on `isRemote()`: they call the device-less Web
API (`/me/player/play|pause|next|previous|seek|shuffle|repeat`) through
`remoteDo()` (optimistic update, then recheck). `controls.playHere` transfers
with `play:true`. `playContext`/`playUris` play with this `device_id` and retry
after a transfer on 404. Remote positions keep the smooth estimate unless off
by 400ms+. `?demo&remote` previews the remote UI.

Media keys (`mediaSession.ts`): sets `navigator.mediaSession` metadata and
handlers. The SDK's audio lives in its own iframe, and Chrome routes media keys
to the top-most frame that has a media player, so the page plays a silent,
looping 6s WAV (generated in JS; clips under 5s are ignored) only while music
plays in this tab. Started on the first pointerdown/keydown (autoplay rules).

Hard limits: needs Premium (`account_error`), and only works in browsers with
Widevine DRM (Chrome, Edge). Spotify doesn't support the SDK on mobile
browsers. A plain Electron wrapper can't play it either (no Widevine), which is
why this is a web app installed as a PWA rather than an .exe.

### Spotify API rules (as of Oct 2026). Read before adding features.

Spotify locked down Development Mode apps in Nov 2024 and again Feb/Mar 2026:

- App owner must have Premium. Max ~5 allowlisted users (dashboard > User Management).
- REMOVED for new/dev apps: recommendations, related artists, audio features,
  audio analysis, featured playlists, category playlists, browse/new-releases,
  browse/categories, artist top-tracks, markets, batch GETs (`/tracks`,
  `/albums`, `/artists`), `/users/{id}` and `/users/{id}/playlists`.
- Spotify-owned and algorithmic playlists (Discover Weekly, Daily Mix,
  Release Radar) are not accessible. "For you" uses Last.fm instead.
- Search `limit` max is 10 (default 5). Paginate with `offset` for more.
- `GET /artists/{id}/albums` `limit` max is also 10 now (asking for more is
  rejected). `artistAlbums()` fetches pages of 10 in parallel, up to 60.
- Artist top tracks are gone; `artistSongs()` searches `artist:"Name"` (two
  pages of 10), keeps tracks credited to that artist, and dedupes by title.
  The artist page shows these as "Popular".
- Assume any `limit` might now be 10 and check the endpoint's reference page.
- Playlists: `tracks` was renamed to `items`, and each entry's `track` to
  `item`. `playlistTracks()` reads either. Song lists are only returned for
  playlists the user owns or collaborates on; followed playlists give metadata
  only (the UI says so and still plays them via `context_uri`).
- Library: the old `/me/tracks` PUT/DELETE/contains are gone. Use
  `PUT /me/library?uris=`, `DELETE /me/library?uris=`,
  `GET /me/library/contains?uris=` (comma-separated URIs, max 40). Supported
  URI types listed by Spotify don't include artists, so there's no Follow
  button on artist pages.
- Still available and used: `/me`, `/me/playlists`, `/me/tracks` (GET),
  `/me/albums` (GET), `/me/top/{type}`, `/me/player` (GET state, PUT
  transfer), `/me/player/*` (play, pause, next, previous, seek, shuffle,
  repeat, queue, recently-played), `/playlists/{id}`, `/albums/{id}`,
  `/artists/{id}`, `/artists/{id}/albums`, `/search`.
- `/me/playlists` and `/me/albums` return 50 per page, newest/most recently
  played first. Always load every page (`allPlaylists`, `allAlbums`).
- Check https://developer.spotify.com/documentation/web-api/references/changes
  before relying on any endpoint not listed here.

### Lyrics (src/lib/lyrics.ts). Verified behavior, Oct 2026.

Source: LRCLIB (lrclib.net), free, timed LRC lyrics.

- `GET /api/get?artist_name&track_name&album_name&duration` works from the
  browser ONLY when it finds a match. A 404 has no CORS header, so a miss looks
  like a network error ("Failed to fetch"). `album_name` is effectively
  required and must match; duration must be within about 2 seconds.
- `GET /api/search` sends no CORS headers at all, so it can't be called from
  the browser directly.
- Strategy: try direct `/api/get` with the original and cleaned title
  (`cleanTitle` strips feat./remaster/live/version suffixes) and album
  (`cleanAlbum` strips parentheses and " - ..." suffixes). If nothing matches,
  call `/api/search` through a relay: Dylan's own Cloudflare Worker if set in
  Settings (`lyricsRelay`), else public relays `api.cors.lol` then
  `api.allorigins.win/raw`. Public relays are rate-limited and flaky (tested).
  `best()` scores results by synced lyrics, duration, title and artist match,
  and requires a score of 7+ so the wrong song's lyrics never show.
- Results: `synced | plain | instrumental | none | offline`. `offline` (relays
  unreachable) isn't cached, and the UI offers "Try again".
- Tested live in a browser: Blinding Lights, Bad Habit, Let It Be (Remastered
  2009), FE!N (feat. Playboi Carti), and Sicko Mode all matched directly.
- Rendering (Lyrics.tsx `Synced`): one requestAnimationFrame loop. React
  re-renders only when the active line changes; the active line's word fill
  (`--p` on each `.w` span) and gap dots are written straight to the DOM.
  Lines are memoized. `LEAD_MS = 150` shows lines slightly early. Position is
  resynced from `sdk.getCurrentState()` every 1s in player.ts
  (local call, no network; only corrects drift over 60ms to avoid jitter).
- Most LRCLIB lyrics are line-timed. Per-word fill is estimated across the
  line by word length (`wordsOf` in Lyrics.tsx); real `<mm:ss.xx>` word tags
  are used when present.
- `lyrics-relay-worker.js` is the optional Worker (forwards only `/api/get`
  and `/api/search`, adds CORS, caches a day). README has setup steps.
- Never print, paste, or commit real song lyrics anywhere (copyright). Test
  only that lyrics were found and how many lines.

### "For you" (src/lib/lastfm.ts)

Optional. With a Last.fm API key in Settings, takes up to 4 seeds (top tracks,
else recently played), calls `track.getsimilar`, interleaves results favoring
new artists, finds each on Spotify with a 1-result search, and caches for a
day in localStorage (`afterglow.foryou`). Without a key, Home shows a nudge.

### Look and feel

- One loud element: the lyrics (heavy 800 weight, large, word-by-word fill
  with an accent-colored glow). Everything else is quiet glass.
- Background (`Background.tsx`): the current cover drawn 4 times, rotating
  and drifting, on a tiny canvas (12% of screen size), blurred with
  `ctx.filter` inside the canvas, then stretched; about 30fps, crossfading on
  track change. Static when motion is off or
  the OS asks for reduced motion. Other modes: uploaded wallpaper, or plain
  gradient. Plus a dim layer and faint film grain.
- Accent color: `albumColors()` buckets hues from a 24x24 sample and sets
  `--accent` and `--glow` on `:root` (App.tsx `useTheme`). Toggleable.
- Glass panels: `--panel` uses `--glass` opacity + backdrop blur. Radius
  hierarchy: panels 18px, covers 8px, pills fully round.
- Font: Schibsted Grotesk. Base `#07080c`, ink `#f4f2f7`.
- The tab icon swaps to the current album art; the title shows the song.
- Responsive down to phone width (sidebar becomes a top bar).
- Respects `prefers-reduced-motion`; visible focus rings; keyboard usable.
- Copy style: plain, sentence case, no all-caps labels, errors say what to do.

### Settings (localStorage `afterglow.settings`)

background (album/wallpaper/plain), wallpaper (downscaled data URL), blur,
dim, glass, motion, albumAccent, lyricsSize, lyricsOffsetMs, lastfmKey,
lyricsRelay, doubleClick (play/queue). Volume is stored separately
(`afterglow.volume`).

### Keyboard shortcuts

Space play/pause, L lyrics view, Q queue, N next, P previous, / search, Esc
closes the lyrics view (or the queue). Ignored while typing in inputs. Media
keys work through `mediaSession.ts`.

## Performance rules (learned the hard way)

The lyrics view once ran at about 6fps because of visual effects, not
JavaScript. Keep it smooth:

- Never put CSS `filter`, `backdrop-filter`, or `mix-blend-mode` on large or
  constantly changing elements (the background canvas, every lyric line).
  Blur inside the small canvas instead.
- Don't re-render lists every frame. Animate with refs and CSS variables.
- Measure before and after: open `?demo`, press L, and count
  requestAnimationFrame frames over 5s in Playwright (aim for about 60fps).

## Known gaps and ideas

Not yet verified with a real account (ask Dylan to test after changes here):
- Other-device mode: "Playing on ..." detection, remote controls, Play here,
  and that opening the app no longer takes over playback.
- Media keys: whether the silent anchor audio wins media-key routing over the
  SDK iframe in Chrome/Edge on Windows.
- `/me/library` save/unsave/contains parameter format (query string `uris`).
- Shuffle/repeat timing right after starting a new context.
- Floating mini player (Document Picture-in-Picture, Chrome 116+); its
  timeline uses a 500ms timer so it keeps moving when the main window is hidden.

Things Spotify doesn't allow (don't try): speed/pitch control, visuals that
react to the real audio (stream is DRM-encrypted), Spotify's own
recommendations, song lists of playlists he doesn't own.

Possible next features: playlist
editing (`POST /playlists/{id}/items`), recently played history page, more
background styles, lyrics font options, a "Mixes" section built from Last.fm.

## Background: why not just clone Liner?

Dylan first asked about Liner. Its desktop client is source-available (not
truly open source), streams audio from YouTube via a closed backend, silently
downloads replacement UI code from its server, and collects more than its
privacy page claims. Afterglow keeps the parts he liked (look, lyrics, mini
player, customization) and uses Spotify legitimately instead.
