import { getAccessToken, isDemo } from "./auth";
import { createStore } from "./store";
import { ApiError, spotify, type Track } from "./spotify";
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
  getCurrentState(): Promise<SdkState | null>;
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
  /** Set when music is playing on another device (phone, speaker, Spotify app). */
  remote: { name: string; type: string } | null;
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
  remote: null,
});

/** Bumped whenever the queue changes, so the queue panel knows to reload. */
export const queueVersion = createStore({ n: 0 });

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

/* ---------- Other devices ----------
 * The Web Playback SDK only reports music playing in this tab. To see (and
 * not steal) music playing elsewhere, ask Spotify which device is active.
 * Only needed while this tab isn't the one playing.
 */

let playingHere = false;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

async function checkActiveDevice(): Promise<"idle" | "here" | "remote"> {
  if (isDemo) return "here";
  const sent = Date.now();
  const s = await spotify.playbackState().catch(() => undefined);
  const latency = (Date.now() - sent) / 2;
  if (!s?.device) {
    if (player.get().remote) player.set({ remote: null, paused: true, position: currentPosition(), stamp: Date.now() });
    return "idle";
  }
  if (s.device.id === player.get().deviceId) {
    if (player.get().remote) player.set({ remote: null });
    return "here";
  }
  const prev = player.get();
  const track = s.item?.album ? fromTrack(s.item) : null;
  const position = (s.progress_ms ?? 0) + (s.is_playing ? latency : 0);
  // Keep the smooth estimate unless it's noticeably off (avoids tiny jumps).
  const sameSong = prev.remote && prev.track?.uri === track?.uri && prev.paused === !s.is_playing;
  const keepPosition = sameSong && Math.abs(position - currentPosition()) < 400;
  player.set({
    remote: { name: s.device.name, type: s.device.type },
    track,
    upNext: sameSong ? prev.upNext : [],
    contextUri: s.context?.uri ?? null,
    paused: !s.is_playing,
    shuffle: s.shuffle_state,
    repeat: s.repeat_state ?? "off",
    ...(keepPosition ? {} : { position, stamp: Date.now() }),
  });
  return "remote";
}

/** Checks often while another device is playing, rarely otherwise, never while this tab plays. */
function schedulePoll() {
  clearTimeout(pollTimer);
  if (playingHere || isDemo) return;
  const s = player.get();
  const delay = document.visibilityState === "hidden" ? 30_000 : s.remote && !s.paused ? 5_000 : 15_000;
  pollTimer = setTimeout(async () => {
    await checkActiveDevice();
    schedulePoll();
  }, delay);
}

function recheckSoon(ms = 700) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    await checkActiveDevice();
    schedulePoll();
  }, ms);
}

const isRemote = () => !!player.get().remote;

/** Runs a command on the other device, updating the screen right away. */
async function remoteDo(fn: () => Promise<unknown>, optimistic?: Partial<PlayerState>) {
  if (optimistic) {
    const position = optimistic.position ?? currentPosition();
    player.set({ ...optimistic, position, stamp: Date.now() });
  }
  try {
    await fn();
  } catch (e) {
    player.set({ error: `Couldn't control ${player.get().remote?.name ?? "the other device"}: ${(e as Error).message}` });
  }
  recheckSoon();
}

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
      // If music is playing on another device, leave it there and show it.
      // If nothing is playing anywhere, load the last session here, paused.
      void checkActiveDevice().then((where) => {
        if (where === "idle") spotify.transfer(device_id, false).catch(() => {});
        schedulePoll();
      });
    });
    sdk.addListener("not_ready", () => player.set({ status: "connecting" }));
    sdk.addListener("player_state_changed", (s: SdkState | null) => {
      if (!s) {
        // Playback moved to another device.
        playingHere = false;
        recheckSoon(300);
        return;
      }
      playingHere = true;
      clearTimeout(pollTimer);
      const cur = s.track_window.current_track;
      player.set({
        remote: null,
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

    // Spotify only reports the position when something changes (play, pause,
    // skip), and we estimate it in between. Check in every second and correct
    // any drift so lyrics stay locked to the music. The check is local (no
    // network), and the 60ms threshold keeps it from jittering.
    setInterval(async () => {
      const s = player.get();
      if (!sdk || s.paused || !s.track || s.remote || document.visibilityState === "hidden") return;
      const real = await sdk.getCurrentState().catch(() => null);
      if (!real || real.paused) return;
      const drift = real.position - currentPosition();
      if (Math.abs(drift) > 60) player.set({ position: real.position, stamp: Date.now() });
    }, 1000);
  };

  // Coming back to the window: catch up on what other devices did meanwhile.
  const onReturn = () => {
    if (document.visibilityState === "visible" && !playingHere && player.get().status === "ready") recheckSoon(0);
  };
  document.addEventListener("visibilitychange", onReturn);
  addEventListener("focus", onReturn);

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

/**
 * Starts music in this tab. Spotify occasionally answers "device not found"
 * when this tab isn't the active device yet; making it active first fixes that.
 */
async function playHereWith(device: string, body: Record<string, unknown>) {
  try {
    await spotify.play(device, body);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    await spotify.transfer(device, false);
    await new Promise((r) => setTimeout(r, 600));
    await spotify.play(device, body);
  }
}

/* ---------- Controls ---------- */

export const controls = {
  playContext: (contextUri: string, offset?: { uri?: string; position?: number }) =>
    withDevice((d) => (isDemo ? demoPlay() : playHereWith(d, { context_uri: contextUri, ...(offset ? { offset } : {}) }))),
  /** For lists without a Spotify context (liked songs, search results). */
  playUris: (uris: string[], index = 0) =>
    withDevice((d) => {
      // Spotify accepts a limited list, so send a window starting at the chosen song.
      const start = Math.max(0, index);
      const slice = uris.slice(start, start + 100);
      return isDemo ? demoPlay() : playHereWith(d, { uris: slice });
    }),
  /** Moves whatever is playing on another device to this tab. */
  playHere: () => withDevice((d) => (isDemo ? demoSet({ remote: null }) : spotify.transfer(d, true))),
  toggle: () => {
    if (isDemo) return demoToggle();
    if (isRemote()) {
      const paused = player.get().paused;
      return remoteDo(paused ? spotify.remote.play : spotify.remote.pause, { paused: !paused });
    }
    return sdk?.togglePlay();
  },
  next: () => (isDemo ? demoSkip(1) : isRemote() ? remoteDo(spotify.remote.next) : sdk?.nextTrack()),
  prev: () => {
    if (currentPosition() > 3000) return controls.seek(0);
    return isDemo ? demoSkip(-1) : isRemote() ? remoteDo(spotify.remote.previous) : sdk?.previousTrack();
  },
  seek: (ms: number) => {
    if (!isDemo && isRemote()) return remoteDo(() => spotify.remote.seek(ms), { position: ms });
    player.set({ position: ms, stamp: Date.now() });
    return isDemo ? undefined : sdk?.seek(Math.round(ms));
  },
  setVolume: (v: number) => {
    player.set({ volume: v });
    localStorage.setItem("afterglow.volume", String(v));
    return sdk?.setVolume(v);
  },
  shuffle: () => controls.setShuffle(!player.get().shuffle),
  setShuffle: (on: boolean) => {
    if (isDemo) return demoSet({ shuffle: on });
    if (isRemote()) return remoteDo(() => spotify.shuffle(undefined, on), { shuffle: on });
    return withDevice((d) => spotify.shuffle(d, on));
  },
  cycleRepeat: () => {
    const next = REPEAT[(REPEAT.indexOf(player.get().repeat) + 1) % 3];
    if (isDemo) return demoSet({ repeat: next });
    if (isRemote()) return remoteDo(() => spotify.repeat(undefined, next), { repeat: next });
    return withDevice((d) => spotify.repeat(d, next));
  },
  addToQueue: async (uri: string) => {
    if (!isDemo) {
      if (isRemote()) await spotify.addToQueue(uri).catch((e: Error) => player.set({ error: e.message }));
      else await withDevice((d) => spotify.addToQueue(uri, d));
    }
    // Spotify takes a moment to update its queue list.
    setTimeout(() => queueVersion.set((q) => ({ n: q.n + 1 })), 400);
  },
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
  // ?demo&remote previews how it looks when music plays on another device.
  if (new URLSearchParams(location.search).has("remote")) player.set({ remote: { name: "Dylan's iPhone", type: "Smartphone" } });
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
