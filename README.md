# Afterglow

A custom Spotify player with album-art backgrounds, synced lyrics, and a floating mini player.

## Put it online (GitHub Pages)

1. On GitHub, create a new public repository named `afterglow`.
2. Click "uploading an existing file" and drag in the three files from `afterglow-site.zip`:
   `index.html`, `manifest.webmanifest`, `icon.svg`. Commit.
3. Go to Settings > Pages. Under "Build and deployment", pick "Deploy from a branch",
   choose `main` and `/ (root)`, then Save.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/afterglow/`.
5. Open that address in Chrome or Edge and follow the steps on screen.
   The redirect address it shows must be pasted into the Spotify dashboard exactly.

To install it like a desktop app, click the install icon at the right of Chrome's
address bar (or menu > Cast, save and share > Install page as app).

## Game quick menu (Caps Lock + Tab, Windows)

A mini player that pops up over games. Browsers can't hear your keyboard while
a game is in front, so this is a tiny separate helper made with AutoHotkey.

1. Install AutoHotkey v2 (free) from autohotkey.com. Pick "Download v2.0".
2. Download `tools/afterglow-quick-menu.ahk` from this repo and double-click it.
   A green "H" icon appears near the clock.
3. Have Afterglow open, installed as an app (so it has its own window).
4. In a game, press Caps Lock + Tab. Use Space, arrow keys (or WASD), and Esc.

To start it with Windows: press Win+R, type `shell:startup`, press Enter, and
put a shortcut to the script in that folder.

If it doesn't show over a game, set the game's display mode to "Borderless" or
"Windowed fullscreen". If the game runs as administrator, right-click the
script and choose "Run as administrator".

## Optional: your own lyrics relay

Lyrics come from LRCLIB. Its exact lookup works directly, but its search only
works through a relay. Afterglow uses free public relays by default; if lyrics
start failing a lot, make your own (free, about 2 minutes):

1. Sign up at dash.cloudflare.com, then go to Workers & Pages > Create > Create Worker.
2. Name it something like `afterglow-lyrics` and click Deploy.
3. Click Edit code, replace everything with the contents of `lyrics-relay-worker.js`, and Deploy again.
4. Copy the Worker's address (like `https://afterglow-lyrics.yourname.workers.dev`)
   into Afterglow > Settings > Lyrics relay.

## Requirements

- Spotify Premium (Spotify requires it for playback outside its own app)
- Chrome or Edge (Firefox and Safari can't play Spotify's protected audio here)
- Optional: a free Last.fm API key for the "For you" row (last.fm/api/account/create)

## Shortcuts

Space play/pause · L lyrics · Q queue · N next · P previous · / search · Esc close · media keys work too

## Working on the code

    npm install
    npm run dev      # http://127.0.0.1:5173 (add this as a redirect URI too)
    npm run build    # writes dist/index.html, manifest and icon

Add `?demo` to the address to preview with made-up music and no login.

## What Spotify doesn't allow (2026 rules)

- Its own suggestions (Discover Weekly, Daily Mixes, Recommendations). "For you" uses Last.fm instead.
- Song lists for playlists you don't own. They still play; the list just isn't shown.
- Speed and pitch control, or visuals that react to the actual audio.
- More than 5 people using your Spotify app (you can add friends in the dashboard under User Management).
