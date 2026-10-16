import { spotify, type Track } from "./spotify";

/**
 * "For you" suggestions. Spotify no longer gives new apps its recommendations,
 * so we ask Last.fm for songs similar to what you've been playing, then find
 * those songs on Spotify.
 */

interface SimilarTrack { name: string; artist: { name: string }; match: string }

const CACHE_KEY = "afterglow.foryou";
const DAY = 24 * 60 * 60 * 1000;

async function similar(key: string, artist: string, track: string): Promise<SimilarTrack[]> {
  const params = new URLSearchParams({
    method: "track.getsimilar",
    artist,
    track,
    api_key: key,
    format: "json",
    limit: "12",
    autocorrect: "1",
  });
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`);
  if (!res.ok) throw new Error("Last.fm didn't respond");
  const json = await res.json();
  if (json.error) throw new Error(json.message ?? "Last.fm key was rejected");
  return json.similartracks?.track ?? [];
}

export async function forYou(key: string, seeds: Track[], want = 14): Promise<Track[]> {
  const seedIds = seeds.map((s) => s.id).join(",");
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (cached && cached.seeds === seedIds && Date.now() - cached.at < DAY) return cached.tracks;
  } catch {
    /* ignore a bad cache */
  }

  const known = new Set(seeds.map((s) => s.id));
  const knownArtists = new Set(seeds.flatMap((s) => s.artists.map((a) => a.name.toLowerCase())));
  const lists = await Promise.all(
    seeds.slice(0, 4).map((s) => similar(key, s.artists[0].name, s.name).catch(() => [] as SimilarTrack[])),
  );

  // Interleave the lists so one seed doesn't dominate, and favor new artists.
  const picks: SimilarTrack[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    for (const list of lists) {
      const s = list[i];
      if (!s) continue;
      const k = `${s.artist.name}|${s.name}`.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      picks.push(s);
    }
  }
  picks.sort((a, b) => Number(knownArtists.has(a.artist.name.toLowerCase())) - Number(knownArtists.has(b.artist.name.toLowerCase())));

  const out: Track[] = [];
  for (const p of picks) {
    if (out.length >= want) break;
    const t = await spotify.searchTrack(p.artist.name, p.name).catch(() => undefined);
    if (t && !known.has(t.id)) {
      known.add(t.id);
      out.push(t);
    }
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify({ seeds: seedIds, at: Date.now(), tracks: out }));
  return out;
}
