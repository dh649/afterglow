# Changelog

Every change to Afterglow, newest first, in plain language.

## October 16, 2026

### Faster lyrics sync
- The app now double-checks the song's position with Spotify every second
  instead of every 2 seconds, so lyrics recover from buffering hiccups twice
  as fast. The check happens inside your browser, so it uses no data.

## October 15, 2026

### Smoother lyrics
- Lyrics went from choppy to perfectly smooth (about 6 to 60 frames per second
  in testing). Only the line being sung updates now, instead of every line in
  the song.
- The background blur is now done on a tiny image before it's stretched, which
  was the biggest slowdown. It looks the same.
- Removed effects that cost a lot but weren't visible: a blur behind the lyrics
  view (the page behind it is hidden anyway), a per-line blur on lyrics, and a
  film-grain blend mode.
- Lyrics stay in sync better: the app now double-checks the song's position
  with Spotify every 2 seconds and corrects any drift.
- Lines light up a split second early (0.15s), since singers start words just
  before lyric files usually mark them. The timing slider still fine-tunes it.

### Auto-publish
- The full source code now lives in the GitHub repo, with notes for Claude Code
  in `CLAUDE.md`.
- Every change pushed to GitHub is built and published automatically, about a
  minute later. No more uploading files by hand.

### Lyrics fix
- Fixed lyrics not showing for most songs. The lyrics service only answered
  when Spotify's album name and length matched its records exactly.
- The app now tries cleaned-up song and album names (without "Remastered",
  "feat.", "Deluxe" and so on), then falls back to a search through a relay.
- Added an optional private lyrics relay (Settings > Lyrics relay) for when the
  free public relays are busy.
- If lyrics can't be reached, the app now says so and offers "Try again"
  instead of claiming there are no lyrics.

### First version
- Spotify login and playback in the browser, installable as an app from
  Chrome or Edge.
- Swirling album-art background, colors that match the current cover, and
  glass panels.
- Full-screen lyrics with word-by-word highlighting, tap a line to jump to it,
  and a timing adjuster.
- Floating mini player that stays on top of other windows.
- Home: jump back in, recently played, on repeat, top artists, your playlists,
  and "For you" suggestions (with a free Last.fm key).
- Playlist, album, artist, liked songs, and search pages.
- Settings for background, blur, dim, glass, lyrics size and timing, and
  double-click behavior.
- Keyboard shortcuts: Space, L, N, P, /, Esc.
