import { isDemo } from "./auth";
import { demoLyrics } from "./demo";
import { settings } from "./settings";
import type { NowPlaying } from "./player";

export interface LyricWord { time: number; text: string }
export interface LyricLine { time: number; end: number; text: string; words?: LyricWord[] }
export type Lyrics =
  | { kind: "synced"; lines: LyricLine[] }
  | { kind: "plain"; text: string }
  | { kind: "instrumental" }
  | { kind: "none" }
  /** The lyrics service couldn't be reached at all (worth retrying later). */
  | { kind: "offline" };

interface LrclibRecord {
  trackName?: string;
  artistName?: string;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
  duration: number | null;
}

const LRCLIB = "https://lrclib.net";
const cache = new Map<string, Promise<Lyrics>>();

const stamp = (m: string, s: string) => (Number(m) * 60 + Number(s)) * 1000;

/** Parses LRC text, including the optional per-word "<mm:ss.xx>" timing some songs have. */
export function parseLrc(lrc: string, durationMs: number): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const body = raw.replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g, "").trim();
    let words: LyricWord[] | undefined;
    if (/<\d+:\d+(?:\.\d+)?>/.test(body)) {
      words = [...body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)/g)]
        .map((w) => ({ time: stamp(w[1], w[2]), text: w[3].trim() }))
        .filter((w) => w.text);
    }
    // A lone music note marks an instrumental break; treat it like a gap.
    const text = body.replace(/<\d+:\d+(?:\.\d+)?>/g, "").replace(/\s+/g, " ").replace(/^[♪♫\s]+$/, "").trim();
    for (const t of tags) lines.push({ time: stamp(t[1], t[2]), end: 0, text, words });
  }
  lines.sort((a, b) => a.time - b.time);
  lines.forEach((l, i) => (l.end = lines[i + 1]?.time ?? durationMs));
  return lines;
}

function toLyrics(r: LrclibRecord | undefined, durationMs: number): Lyrics {
  if (!r) return { kind: "none" };
  if (r.instrumental) return { kind: "instrumental" };
  if (r.syncedLyrics) return { kind: "synced", lines: parseLrc(r.syncedLyrics, durationMs) };
  if (r.plainLyrics) return { kind: "plain", text: r.plainLyrics };
  return { kind: "none" };
}

/* ---------- Name cleanup: Spotify titles often carry extras LRCLIB doesn't ---------- */

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

export function cleanTitle(t: string) {
  return t
    .replace(/\s*[([](feat|ft|with|prod)\.?\s[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+.*(remaster|live|version|edit|mono|stereo|from|recorded|session|mix\b|acoustic|radio).*$/i, "")
    .replace(/\s*[([][^)\]]*(remaster|version|edit|mono|stereo|live)[^)\]]*[)\]]/gi, "")
    .trim();
}

export function cleanAlbum(a: string) {
  return a.replace(/\s*[([][^)\]]*[)\]]/g, "").replace(/\s+-\s+.*$/, "").trim();
}

/* ---------- Requests ---------- */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetches from LRCLIB, waiting and retrying when it says it's busy (503/502/429).
 * Returns the response, "busy" if it stayed busy, or null if the request
 * couldn't be made (offline, or blocked by the browser).
 */
async function lrclib(url: string, tries = 3): Promise<Response | "busy" | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (![429, 502, 503, 504].includes(res.status)) return res;
    } catch {
      return null;
    }
    if (i < tries - 1) await wait(1200 * (i + 1));
  }
  return "busy";
}

type Get = LrclibRecord | "miss" | "busy";

/** LRCLIB's exact lookup: artist, title, album and length must all match. */
async function directGet(artist: string, title: string, album: string, secs: number): Promise<Get> {
  const qs = new URLSearchParams({ artist_name: artist, track_name: title, album_name: album, duration: String(secs) });
  const res = await lrclib(`${LRCLIB}/api/get?${qs}`);
  if (res === "busy") return "busy";
  if (!res || !res.ok) return "miss"; // a miss sometimes shows up as a blocked request
  return ((await res.json().catch(() => null)) as LrclibRecord | null) ?? "miss";
}

/**
 * LRCLIB's fuzzy search. Tried directly first (allowed since late 2026), then
 * through the person's own relay or free public relays as a fallback.
 * Returns results, "busy" if LRCLIB was overloaded, or null if unreachable.
 */
function relays(target: string): string[] {
  const own = settings.get().lyricsRelay.trim().replace(/\/+$/, "");
  if (own) return [own + target.slice(LRCLIB.length)];
  return [
    `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  ];
}

async function relaySearch(params: Record<string, string>): Promise<LrclibRecord[] | "busy" | null> {
  const target = `${LRCLIB}/api/search?${new URLSearchParams(params)}`;
  let busy = false;
  for (const url of [target, ...relays(target)]) {
    const res = await lrclib(url, url === target ? 3 : 1);
    if (res === "busy") {
      busy = true;
      continue;
    }
    if (!res?.ok) continue;
    const json = await res.json().catch(() => null);
    if (Array.isArray(json)) return json as LrclibRecord[]; // relays sometimes return their own error object
  }
  return busy ? "busy" : null;
}

/** Picks the result that best matches the song, preferring timed lyrics of the same length. */
function best(results: LrclibRecord[], t: NowPlaying): LrclibRecord | undefined {
  const secs = t.durationMs / 1000;
  const title = norm(cleanTitle(t.name));
  const artists = t.artists.map((a) => norm(a.name));
  const score = (r: LrclibRecord) => {
    let s = 0;
    if (r.syncedLyrics) s += 4;
    else if (r.plainLyrics || r.instrumental) s += 1;
    if (r.duration && Math.abs(r.duration - secs) <= 2) s += 4;
    else if (r.duration && Math.abs(r.duration - secs) <= 6) s += 2;
    if (r.trackName && norm(cleanTitle(r.trackName)) === title) s += 3;
    if (r.artistName && artists.some((a) => norm(r.artistName!).includes(a) || a.includes(norm(r.artistName!)))) s += 3;
    return s;
  };
  const ranked = results.map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s);
  // Require a sensible title or artist match so we never show the wrong song's words.
  return ranked.find((x) => x.s >= 7)?.r;
}

/* ---------- Saved lyrics ----------
 * Lyrics that loaded once are kept in this browser, so songs you've played
 * before still show lyrics when the lyrics site is down, and open instantly.
 */

const SAVED_KEY = "afterglow.lyrics.v1";
const MAX_SAVED = 400;
const RECHECK_NONE_MS = 7 * 24 * 60 * 60 * 1000; // songs with no lyrics: look again after a week

interface Saved {
  at: number;
  synced?: string | null;
  plain?: string | null;
  instrumental?: boolean;
  none?: boolean;
}

function readSaved(): Record<string, Saved> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function loadSaved(id: string, durationMs: number): Lyrics | null {
  const s = readSaved()[id];
  if (!s) return null;
  if (s.none) return Date.now() - s.at < RECHECK_NONE_MS ? { kind: "none" } : null;
  return toLyrics({ syncedLyrics: s.synced ?? null, plainLyrics: s.plain ?? null, instrumental: !!s.instrumental, duration: null }, durationMs);
}

function save(id: string, rec: LrclibRecord | null) {
  const all = readSaved();
  all[id] = rec
    ? { at: Date.now(), synced: rec.syncedLyrics, plain: rec.syncedLyrics ? null : rec.plainLyrics, instrumental: rec.instrumental }
    : { at: Date.now(), none: true };
  let entries = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_SAVED);
  // If the browser's storage is full, keep halving until it fits.
  while (entries.length) {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(Object.fromEntries(entries)));
      return;
    } catch {
      entries = entries.slice(0, Math.floor(entries.length / 2));
    }
  }
}

async function fetchLyrics(t: NowPlaying): Promise<Lyrics> {
  if (isDemo) return { kind: "synced", lines: parseLrc(demoLyrics(t.id), t.durationMs) };

  const saved = loadSaved(t.id, t.durationMs);
  if (saved) return saved;

  // Remember any real answer (including "no lyrics"), never a failed connection.
  const done = (rec: LrclibRecord | null, out: Lyrics): Lyrics => {
    if (out.kind !== "offline") save(t.id, out.kind === "none" ? null : rec);
    return out;
  };

  const artist = t.artists[0]?.name ?? "";
  const secs = Math.round(t.durationMs / 1000);
  const titles = [...new Set([t.name, cleanTitle(t.name)])];
  const albums = [...new Set([t.album.name, cleanAlbum(t.album.name)])];

  // 1. Exact lookups, a handful of name variations.
  let fallback: Lyrics | null = null;
  let fallbackRec: LrclibRecord | null = null;
  let busy = false;
  for (const title of titles) {
    for (const album of albums) {
      const hit = await directGet(artist, title, album, secs);
      if (hit === "busy") busy = true;
      if (hit === "busy" || hit === "miss") continue;
      const found = toLyrics(hit, t.durationMs);
      if (found.kind === "synced" || found.kind === "instrumental") return done(hit, found);
      if (!fallback && found.kind === "plain") {
        fallback = found;
        fallbackRec = hit;
      }
    }
  }

  // 2. Fuzzy search through a relay.
  let results = await relaySearch({ track_name: cleanTitle(t.name), artist_name: artist });
  if (Array.isArray(results) && !results.length) results = await relaySearch({ q: `${cleanTitle(t.name)} ${artist}` });
  if (results === "busy") busy = true;
  if (Array.isArray(results)) {
    const pick = best(results, t);
    if (pick) {
      const found = toLyrics(pick, t.durationMs);
      if (found.kind !== "none") return done(pick, found);
    }
    // Only trust "no lyrics" if LRCLIB wasn't too busy to answer every lookup.
    if (fallback) return done(fallbackRec, fallback);
    return busy ? { kind: "offline" } : done(null, { kind: "none" });
  }
  return fallback ? done(fallbackRec, fallback) : { kind: "offline" };
}

export function getLyrics(t: NowPlaying): Promise<Lyrics> {
  let p = cache.get(t.id);
  if (!p) {
    p = fetchLyrics(t).catch(() => ({ kind: "offline" }) as Lyrics);
    cache.set(t.id, p);
    // Don't remember failures caused by a bad connection; try again next time.
    p.then((r) => r.kind === "offline" && cache.delete(t.id));
  }
  return p;
}

export function forgetLyrics(id: string) {
  cache.delete(id);
}
