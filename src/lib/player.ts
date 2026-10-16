import { getAccessToken, isDemo } from "./auth";
import { createStore } from "./store";
import { spotify, type Track } from "./spotify";
import { demoQueue } from "./demo";

/* Minimal typings for Spotify's Web Playback SDK. */
interface SdkTrack {
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string; uri: string }[];
  album: { name: string; uri: string; images: { url: string; width?: number }[] };
}
interface SdkState {
  paused: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat_mode: 0 | 1 | 2;
  context: { uri: string | null };
  track_window: { current_track: SdkTrack | null; next_tracks: SdkTrack[]; previous_tracks: SdkTrack[] };
}
interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(ev: string, cb: (arg: any) => void): void;
  togglePlay(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  activateElement(): Promise<void>;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume: number }) => SdkPlayer };
  }
}

export interface NowPlaying {
  uri: string;
  id: string;
  name: string;
  durationMs: number;
  artists: { name: string; id: string }[];
  album: { name: string; id: string; image?: string; imageSmall?: string };
}

export interface PlayerState {
  status: "idle" | "connecting" | "ready" | "error";
  error: string;
  deviceId: string;
  track: NowPlaying | null;
  upNext: NowPlaying[];
  contextUri: string | null;
  paused: boolean;
  /** Position (ms) at `stamp`. Use `currentPosition()` for the live value. */
  position: number;
  stamp: number;
  shuffle: boolean;
  repeat: "off" | "context" | "track";
  volume: number;
}

export const player = createStore<PlayerState>({
  status: "idle",
  error: "",
  deviceId: "",
  track: null,
  upNext: [],
  contextUri: null,
  paused: true,
  position: 0,
  stamp: Date.now(),
  shuffle: false,
  repeat: "off",
  volume: Number(localStorage.getItem("afterglow.volume") ?? 0.7),
});

export function currentPosition() {
  const s = player.get();
  if (!s.track) return 0;
  const p = s.paused ? s.position : s.position + (Date.now() - s.stamp);
  return Math.min(Math.max(p, 0), s.track.durationMs);
}

const id = (uri: string) => uri.split(":").pop() ?? "";

function fromSdk(t: SdkTrack): NowPlaying {
  const imgs = [...t.album.images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return {
    uri: t.uri,
    id: t.id ?? id(t.uri),
    name: t.name,
    durationMs: t.duration_ms,
    artists: t.artists.map((a) => ({ name: a.name, id: id(a.uri) })),
    album: { name: t.album.name, id: id(t.album.uri), image: imgs[0]?.url, imageSmall: imgs[imgs.length - 1]?.url },
  };
}

export function fromTrack(t: Track): NowPlaying {
  const imgs = [...(t.album.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return {
    uri: t.uri,
    id: t.id,
    name: t.name,
    durationMs: t.duration_ms,
    artists: t.artists.map((a) => ({ name: a.name, id: a.id })),
    album: { name: t.album.name, id: t.album.id, image: imgs[0]?.url, imageSmall: imgs[imgs.length - 1]?.url },
  };
}

let sdk: SdkPlayer | null = null;
const REPEAT = ["off", "context", "track"] as const;

function friendlyError(kind: string, message: string) {
  if (kind === "account_error") return "Spotify Premium is needed to play music outside the Spotify app.";
  if (kind === "initialization_error")
    return "This browser can't play Spotify audio. Open Afterglow in Chrome or Edge.";
  if (kind === "authentication_error") return "Spotify rejected the login. Log out and log in again.";
  return message || "Playback stopped unexpectedly.";
}

/** Loads the SDK and registers this tab as a Spotify Connect device. */
export function connectPlayer() {
  if (player.get().status !== "idle") return;
  if (isDemo) return startDemo();
  player.set({ status: "connecting" });

  window.onSpotifyWebPlaybackSDKReady = () => {
    sdk = new window.Spotify!.Player({
      name: "Afterglow",
      volume: player.get().volume,
      getOAuthToken: (cb) => void getAccessToken().then(cb),
    });
    sdk.addListener("ready", ({ device_id }: { device_id: string }) => {
      player.set({ status: "ready", deviceId: device_id, error: "" });
      // Pick up whatever was last playing in Spotify, but don't start it.
      spotify.transfer(device_id, false).catch(() => {});
    });
    sdk.addListener("not_ready", () => player.set({ status: "connecting" }));
    sdk.addListener("player_state_changed", (s: SdkState | null) => {
      if (!s) return;
      const cur = s.track_window.current_track;
      player.set({
        track: cur ? fromSdk(cur) : null,
        upNext: s.track_window.next_tracks.map(fromSdk),
        contextUri: s.context?.uri ?? null,
        paused: s.paused,
        position: s.position,
        stamp: Date.now(),
        shuffle: s.shuffle,
        repeat: REPEAT[s.repeat_mode] ?? "off",
      });
    });
    for (const kind of ["initialization_error", "authentication_error", "account_error", "playback_error"]) {
      sdk.addListener(kind, ({ message }: { message: string }) =>
        player.set({ status: kind === "playback_error" ? player.get().status : "error", error: friendlyError(kind, message) }),
      );
    }
    sdk.connect();
  };

  const s = document.createElement("script");
  s.src = "https://sdk.scdn.co/spotify-player.js";
  s.onerror = () => player.set({ status: "error", error: "Couldn't load Spotify's player. Check your connection." });
  document.head.appendChild(s);
}

async function withDevice<T>(fn: (device: string) => Promise<T>) {
  const { deviceId, status } = player.get();
  if (!deviceId || status !== "ready") {
    player.set({ error: "The player is still connecting to Spotify. Try again in a moment." });
    return;
  }
  await sdk?.activateElement().catch(() => {});
  try {
    return await fn(deviceId);
  } catch (e) {
    player.set({ error: (e as Error).message });
  }
}

/* ---------- Controls ---------- */

export const controls = {
  playContext: (contextUri: string, offset?: { uri?: string; position?: number }) =>
    withDevice((d) => (isDemo ? demoPlay() : spotify.play(d, { context_uri: contextUri, ...(offset ? { offset } : {}) }))),
  /** For lists without a Spotify context (liked songs, search results). */
  playUris: (uris: string[], index = 0) =>
    withDevice((d) => {
      // Spotify accepts a limited list, so send a window starting at the chosen song.
      const start = Math.max(0, index);
      const slice = uris.slice(start, start + 100);
      return isDemo ? demoPlay() : spotify.play(d, { uris: slice });
    }),
  toggle: () => (isDemo ? demoToggle() : sdk?.togglePlay()),
  next: () => (isDemo ? demoSkip(1) : sdk?.nextTrack()),
  prev: () => {
    if (currentPosition() > 3000) return controls.seek(0);
    return isDemo ? demoSkip(-1) : sdk?.previousTrack();
  },
  seek: (ms: number) => {
    player.set({ position: ms, stamp: Date.now() });
    return isDemo ? undefined : sdk?.seek(Math.round(ms));
  },
  setVolume: (v: number) => {
    player.set({ volume: v });
    localStorage.setItem("afterglow.volume", String(v));
    return sdk?.setVolume(v);
  },
  shuffle: () => controls.setShuffle(!player.get().shuffle),
  setShuffle: (on: boolean) => withDevice((d) => (isDemo ? demoSet({ shuffle: on }) : spotify.shuffle(d, on))),
  cycleRepeat: () =>
    withDevice((d) => {
      const next = REPEAT[(REPEAT.indexOf(player.get().repeat) + 1) % 3];
      return isDemo ? demoSet({ repeat: next }) : spotify.repeat(d, next);
    }),
  addToQueue: (uri: string) => withDevice((d) => (isDemo ? Promise.resolve() : spotify.addToQueue(uri, d))),
  clearError: () => player.set({ error: "" }),
};

/* ---------- Demo mode: a fake player so the design can be previewed without logging in ---------- */

let demoIndex = 0;
let demoTimer: number | undefined;

function demoLoad(i: number, paused: boolean, position = 0) {
  const q = demoQueue();
  demoIndex = (i + q.length) % q.length;
  player.set({
    track: fromTrack(q[demoIndex]),
    upNext: q.slice(demoIndex + 1).concat(q.slice(0, demoIndex)).slice(0, 2).map(fromTrack),
    paused,
    position,
    stamp: Date.now(),
  });
}
function startDemo() {
  player.set({ status: "ready", deviceId: "demo" });
  demoLoad(0, false, 52_000);
  demoTimer = window.setInterval(() => {
    const s = player.get();
    if (s.track && !s.paused && currentPosition() >= s.track.durationMs) demoSkip(1);
  }, 500);
  void demoTimer;
}
async function demoPlay() {
  demoLoad(demoIndex, false);
}
async function demoToggle() {
  const s = player.get();
  player.set({ paused: !s.paused, position: currentPosition(), stamp: Date.now() });
}
async function demoSkip(dir: number) {
  demoLoad(demoIndex + dir, false);
}
async function demoSet(patch: Partial<PlayerState>) {
  player.set(patch);
}
