import { controls, currentPosition, player } from "./player";

/**
 * Connects Afterglow to the keyboard's media keys and the system media popup
 * (Windows volume flyout, macOS Now Playing, Chrome's media button).
 *
 * Spotify's player plays audio inside its own hidden frame, and browsers send
 * media keys to the page that's actually playing sound. So this page plays a
 * silent loop alongside the music to own the media controls, then forwards
 * them to the real player.
 */

/** A few seconds of silence as a WAV file (browsers ignore clips under about 5s). */
function silentWav(seconds = 6, rate = 8000): Blob {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const text = (o: number, str: string) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true); // format chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true); // bytes per second
  v.setUint16(32, 1, true); // block align
  v.setUint16(34, 8, true); // 8-bit
  text(36, "data");
  v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128); // 128 is silence in 8-bit audio
  return new Blob([buf], { type: "audio/wav" });
}

let anchor: HTMLAudioElement | null = null;

export function initMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  const handle = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* this browser doesn't support that button */
    }
  };

  handle("play", () => player.get().paused && controls.toggle());
  handle("pause", () => !player.get().paused && controls.toggle());
  handle("nexttrack", () => controls.next());
  handle("previoustrack", () => controls.prev());
  handle("seekto", (d) => d.seekTime != null && controls.seek(d.seekTime * 1000));
  handle("seekbackward", (d) => controls.seek(Math.max(0, currentPosition() - (d.seekOffset ?? 10) * 1000)));
  handle("seekforward", (d) => controls.seek(currentPosition() + (d.seekOffset ?? 10) * 1000));

  let lastUri = "";
  let lastTiming = "";

  const sync = () => {
    const s = player.get();
    if (s.track && s.track.uri !== lastUri) {
      lastUri = s.track.uri;
      ms.metadata = new MediaMetadata({
        title: s.track.name,
        artist: s.track.artists.map((a) => a.name).join(", "),
        album: s.track.album.name,
        artwork: s.track.album.image ? [{ src: s.track.album.image, sizes: "640x640", type: "image/jpeg" }] : [],
      });
    }
    ms.playbackState = !s.track ? "none" : s.paused ? "paused" : "playing";

    // Only hold the media controls while music plays in this tab.
    const playingHere = !!s.track && !s.remote && !s.paused;
    if (anchor) {
      if (playingHere && anchor.paused) anchor.play().catch(() => {});
      else if (!playingHere && !anchor.paused) anchor.pause();
    }

    // Keep the popup's progress bar honest after plays, pauses, seeks and skips.
    const timing = `${s.track?.uri}|${s.paused}|${s.stamp}`;
    if (s.track && timing !== lastTiming) {
      lastTiming = timing;
      try {
        ms.setPositionState({
          duration: s.track.durationMs / 1000,
          position: Math.min(currentPosition(), s.track.durationMs) / 1000,
          playbackRate: 1,
        });
      } catch {
        /* position briefly out of range during a skip */
      }
    }
  };

  // Browsers only allow sound after the person interacts with the page.
  const start = () => {
    if (anchor) return;
    anchor = new Audio(URL.createObjectURL(silentWav()));
    anchor.loop = true;
    sync();
  };
  addEventListener("pointerdown", start, { once: true, capture: true });
  addEventListener("keydown", start, { once: true, capture: true });

  player.subscribe(sync);
  sync();
}
