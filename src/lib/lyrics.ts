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

/**
 * LRCLIB's exact lookup works straight from the browser, but only answers
 * browsers when it finds a match (a miss looks like a network error).
 */
async function directGet(artist: string, title: string, album: string, secs: number): Promise<LrclibRecord | null> {
  const qs = new URLSearchParams({ artist_name: artist, track_name: title, album_name: album, duration: String(secs) });
  try {
    const res = await fetch(`${LRCLIB}/api/get?${qs}`);
    return res.ok ? ((await res.json()) as LrclibRecord) : null;
  } catch {
    return null;
  }
}

/**
 * LRCLIB's search doesn't allow browser requests, so it goes through a relay:
 * the person's own (Settings), or free public ones as a fallback.
 */
function relays(target: string): string[] {
  const own = settings.get().lyricsRelay.trim().replace(/\/+$/, "");
  if (own) return [own + target.slice(LRCLIB.length)];
  return [
    `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  ];
}

async function relaySearch(params: Record<string, string>): Promise<LrclibRecord[] | null> {
  const target = `${LRCLIB}/api/search?${new URLSearchParams(params)}`;
  for (const url of relays(target)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      if (Array.isArray(json)) return json as LrclibRecord[]; // relays sometimes return their own error object
    } catch {
      /* try the next relay */
    }
  }
  return null;
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

async function fetchLyrics(t: NowPlaying): Promise<Lyrics> {
  if (isDemo) return { kind: "synced", lines: parseLrc(demoLyrics(t.id), t.durationMs) };

  const artist = t.artists[0]?.name ?? "";
  const secs = Math.round(t.durationMs / 1000);
  const titles = [...new Set([t.name, cleanTitle(t.name)])];
  const albums = [...new Set([t.album.name, cleanAlbum(t.album.name)])];

  // 1. Exact lookups, a handful of name variations.
  let fallback: Lyrics | null = null;
  for (const title of titles) {
    for (const album of albums) {
      const hit = await directGet(artist, title, album, secs);
      if (!hit) continue;
      const found = toLyrics(hit, t.durationMs);
      if (found.kind === "synced" || found.kind === "instrumental") return found;
      fallback ??= found.kind === "plain" ? found : null;
    }
  }

  // 2. Fuzzy search through a relay.
  let results = await relaySearch({ track_name: cleanTitle(t.name), artist_name: artist });
  if (results && !results.length) results = await relaySearch({ q: `${cleanTitle(t.name)} ${artist}` });
  if (results) {
    const pick = best(results, t);
    if (pick) {
      const found = toLyrics(pick, t.durationMs);
      if (found.kind !== "none") return found;
    }
    return fallback ?? { kind: "none" };
  }
  return fallback ?? { kind: "offline" };
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
