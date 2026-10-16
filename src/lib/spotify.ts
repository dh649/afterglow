import { getAccessToken, isDemo } from "./auth";
import { demoFetch } from "./demo";

/* ---------- Shapes the app uses (trimmed from Spotify's responses) ---------- */

export interface Image { url: string; width?: number | null }
export interface ArtistRef { id: string; name: string; uri: string }
export interface AlbumRef { id: string; name: string; uri: string; images: Image[]; release_date?: string; album_type?: string; artists?: ArtistRef[] }
export interface Track {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit?: boolean;
  artists: ArtistRef[];
  album: AlbumRef;
  is_local?: boolean;
}
export interface Playlist {
  id: string;
  uri: string;
  name: string;
  description?: string;
  images: Image[] | null;
  owner: { id: string; display_name?: string };
  /** Spotify renamed `tracks` to `items` in 2026; we read either. */
  items?: Paging<{ item?: Track | null; track?: Track | null }> | { total?: number; href?: string };
  tracks?: Paging<{ item?: Track | null; track?: Track | null }> | { total?: number; href?: string };
}
export interface Artist { id: string; uri: string; name: string; images: Image[]; genres?: string[] }
export interface Album extends AlbumRef { tracks: Paging<Omit<Track, "album">>; label?: string; total_tracks?: number }
export interface Paging<T> { items: T[]; next: string | null; total: number; offset?: number }
export interface User { id: string; display_name: string; images?: Image[]; product?: string }
export interface PlayHistory { track: Track; played_at: string; context: { uri: string; type: string } | null }

/* ---------- Request helper ---------- */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = "https://api.spotify.com/v1";

export async function api<T = unknown>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  if (isDemo) return demoFetch<T>(path, init);
  const token = await getAccessToken(retried);
  const res = await fetch(path.startsWith("http") ? path : BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && !retried) return api<T>(path, init, true);
  if (res.status === 429 && !retried) {
    const wait = Number(res.headers.get("Retry-After") ?? 2);
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return api<T>(path, init, true);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error?.message ?? msg;
    } catch {
      /* empty body */
    }
    throw new ApiError(res.status, msg);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* ---------- Helpers ---------- */

export const idFromUri = (uri: string) => uri.split(":").pop() ?? "";
export const typeFromUri = (uri: string) => uri.split(":")[1] ?? "";

export function pickImage(images: Image[] | null | undefined, target = 300): string | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((a, b) => (a.width ?? 640) - (b.width ?? 640));
  return (sorted.find((i) => (i.width ?? 640) >= target) ?? sorted[sorted.length - 1]).url;
}

export function playlistTracks(p: Playlist): Track[] | null {
  const block = (p.items ?? p.tracks) as Paging<{ item?: Track | null; track?: Track | null }> | undefined;
  if (!block || !Array.isArray(block.items)) return null; // Spotify hides songs for playlists you don't own
  return block.items.map((x) => x.item ?? x.track).filter((t): t is Track => !!t && !!t.id);
}

export function playlistCount(p: Playlist): number | undefined {
  return (p.items ?? p.tracks)?.total;
}

/* ---------- Endpoints ---------- */

export const spotify = {
  me: () => api<User>("/me"),
  recentlyPlayed: () => api<Paging<PlayHistory>>("/me/player/recently-played?limit=50"),
  top: <T extends "artists" | "tracks">(type: T, range = "short_term", limit = 20) =>
    api<Paging<T extends "artists" ? Artist : Track>>(`/me/top/${type}?time_range=${range}&limit=${limit}`),
  myPlaylists: (offset = 0) => api<Paging<Playlist>>(`/me/playlists?limit=50&offset=${offset}`),
  /** Every playlist you own or follow. Spotify sends 50 at a time, so keep asking until it's done. */
  allPlaylists: async () => {
    const first = await api<Paging<Playlist | null>>("/me/playlists?limit=50");
    const all = [...first.items];
    let next = first.next;
    while (next) {
      const page = await api<Paging<Playlist | null>>(next);
      all.push(...page.items);
      next = page.next;
    }
    return { ...first, items: all.filter((p): p is Playlist => !!p), next: null } as Paging<Playlist>;
  },
  liked: (offset = 0) => api<Paging<{ added_at: string; track: Track }>>(`/me/tracks?limit=50&offset=${offset}`),
  playlist: (id: string) => api<Playlist>(`/playlists/${id}`),
  page: <T>(url: string) => api<Paging<T>>(url),
  album: (id: string) => api<Album>(`/albums/${id}`),
  artist: (id: string) => api<Artist>(`/artists/${id}`),
  artistAlbums: (id: string) =>
    api<Paging<AlbumRef>>(`/artists/${id}/albums?include_groups=album,single&limit=40`),
  search: (q: string) =>
    api<{
      tracks?: Paging<Track>;
      artists?: Paging<Artist>;
      albums?: Paging<AlbumRef>;
      playlists?: Paging<Playlist | null>;
    }>(`/search?q=${encodeURIComponent(q)}&type=track,artist,album,playlist&limit=10`),
  searchTrack: (artist: string, track: string) =>
    api<{ tracks: Paging<Track> }>(
      `/search?q=${encodeURIComponent(`track:${track} artist:${artist}`)}&type=track&limit=1`,
    ).then((r) => r.tracks.items[0] as Track | undefined),
  isSaved: (uris: string[]) =>
    api<boolean[]>(`/me/library/contains?uris=${encodeURIComponent(uris.join(","))}`),
  save: (uris: string[]) => api(`/me/library?uris=${encodeURIComponent(uris.join(","))}`, { method: "PUT" }),
  unsave: (uris: string[]) => api(`/me/library?uris=${encodeURIComponent(uris.join(","))}`, { method: "DELETE" }),
  queue: () => api<{ currently_playing: Track | null; queue: Track[] }>("/me/player/queue"),
  addToQueue: (uri: string, device?: string) =>
    api(`/me/player/queue?uri=${encodeURIComponent(uri)}${device ? `&device_id=${device}` : ""}`, { method: "POST" }),
  transfer: (device: string, play = false) =>
    api("/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [device], play }) }),
  play: (device: string, body: Record<string, unknown>) =>
    api(`/me/player/play?device_id=${device}`, { method: "PUT", body: JSON.stringify(body) }),
  shuffle: (device: string, on: boolean) =>
    api(`/me/player/shuffle?state=${on}&device_id=${device}`, { method: "PUT" }),
  repeat: (device: string, mode: "off" | "context" | "track") =>
    api(`/me/player/repeat?state=${mode}&device_id=${device}`, { method: "PUT" }),
};
