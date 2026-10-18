/**
 * Made-up music for previewing the design with ?demo in the address bar.
 * All names, covers and lyrics are invented.
 */
import type { Album, AlbumRef, Artist, Image, Playlist, PlayHistory, Track } from "./spotify";

function cover(seed: number, shape: number): Image[] {
  const hues = [[18, 330], [200, 260], [42, 12], [160, 210], [280, 330], [350, 25], [95, 160], [220, 300], [8, 48], [180, 240]];
  const [a, b] = hues[seed % hues.length];
  const shapes = [
    `<circle cx="60%" cy="45%" r="30%" fill="hsl(${a} 95% 70%)" opacity=".9"/>`,
    `<rect x="18%" y="18%" width="64%" height="64%" rx="4%" fill="none" stroke="hsl(${a} 90% 75%)" stroke-width="5%"/>`,
    `<path d="M0 340 Q160 120 320 260 T640 200 V640 H0Z" fill="hsl(${a} 85% 62%)" opacity=".85"/>`,
    `<circle cx="30%" cy="70%" r="44%" fill="hsl(${a} 90% 60%)" opacity=".7"/><circle cx="74%" cy="28%" r="18%" fill="hsl(${a + 40} 90% 80%)"/>`,
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${b} 70% 22%)"/><stop offset="1" stop-color="hsl(${a} 75% 42%)"/></linearGradient></defs>
    <rect width="640" height="640" fill="url(#g)"/>${shapes[shape % shapes.length]}</svg>`;
  return [{ url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, width: 640 }];
}

const artists: Artist[] = [
  ["Marlow Vance"], ["The Low Tides"], ["Iris Okafor"], ["Neon Parish"], ["Calla & the Hum"], ["Juniper Row"], ["Saint Avenue"], ["Ojo Kimura"],
].map(([name], i) => ({ id: `ar${i}`, uri: `spotify:artist:ar${i}`, name, images: cover(i + 3, 3), genres: ["indie"] }));

const ref = (a: Artist) => ({ id: a.id, name: a.name, uri: a.uri });

const albumsRaw: [string, number, string][] = [
  ["Paper Satellites", 0, "2024-04-12"], ["Low Season", 1, "2023-08-01"], ["Glass Orchard", 2, "2025-02-21"], ["Night Market", 3, "2025-09-05"],
  ["Soft Machinery", 4, "2022-11-18"], ["Coastline Static", 5, "2024-06-30"], ["Afterhours", 6, "2025-05-16"], ["Small Weather", 7, "2023-03-03"],
];
const albums: AlbumRef[] = albumsRaw.map(([name, a, date], i) => ({
  id: `al${i}`, uri: `spotify:album:al${i}`, name, images: cover(i, i), release_date: date, album_type: i % 3 === 2 ? "single" : "album", artists: [ref(artists[a])],
}));

const titles = [
  "Ultraviolet Hours", "Kite String", "Where the Bus Turns", "Halogen", "Slow Bloom", "Static on the Line", "Neighbourhood Lights", "Paper Crowns",
  "Second Wind", "Weightless", "Mile Marker", "Daydream Arcade", "Glasshouse", "Overpass", "Blue Hour Radio", "Satellite Hearts",
];
const tracks: Track[] = titles.map((name, i) => {
  const al = albums[i % albums.length];
  return {
    id: `tr${i}`, uri: `spotify:track:tr${i}`, name, duration_ms: 150_000 + ((i * 37_000) % 110_000), explicit: i % 7 === 3,
    artists: [al.artists![0], ...(i % 5 === 1 ? [ref(artists[(i + 3) % artists.length])] : [])], album: al,
  };
});

const playlists: Playlist[] = [
  ["Late drive home", 2], ["Saturday errands", 5], ["Focus, no words", 1], ["Summer '26", 0], ["Gym rotation", 6], ["Rainy Sunday", 7],
].map(([name, c], i) => ({
  id: `pl${i}`, uri: `spotify:playlist:pl${i}`, name: name as string, description: "", images: cover((c as number) + 2, (c as number) + 1),
  owner: { id: "demo", display_name: "You" },
  items: { items: tracks.slice(i, i + 9).map((t) => ({ item: t })), next: null, total: 9 },
}));

const page = <T,>(items: T[]) => ({ items, next: null, total: items.length, offset: 0 });

export const demoQueue = () => tracks;

export async function demoFetch<T>(path: string, _init: RequestInit = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));
  const p = path.replace(/^https:\/\/api\.spotify\.com\/v1/, "");
  const id = p.split("?")[0].split("/")[2];
  let out: unknown = undefined;
  if (p.startsWith("/me/player/recently-played")) {
    out = page<PlayHistory>([3, 0, 8, 5, 1, 12, 9, 6, 14, 2].map((i, n) => ({
      track: tracks[i], played_at: new Date(Date.now() - n * 3.6e6).toISOString(),
      context: n % 3 === 0 ? { uri: playlists[n % playlists.length].uri, type: "playlist" } : { uri: tracks[i].album.uri, type: "album" },
    })));
  } else if (p.startsWith("/me/top/artists")) out = page(artists);
  else if (p.startsWith("/me/top/tracks")) out = page([5, 11, 2, 7, 13, 0, 9, 4].map((i) => tracks[i]));
  else if (p.startsWith("/me/playlists") && _init.method === "POST") {
    const name = JSON.parse(String(_init.body ?? "{}")).name ?? "New playlist";
    const made: Playlist = { id: `pl${playlists.length}`, uri: `spotify:playlist:pl${playlists.length}`, name, images: [], owner: { id: "demo", display_name: "You" }, items: { items: [], next: null, total: 0 } };
    playlists.unshift(made);
    out = made;
  } else if (p.startsWith("/me/playlists")) out = page(playlists);
  else if (p.startsWith("/me/albums")) out = page(albums.slice(1, 7).map((al, i) => ({ added_at: new Date(Date.now() - i * 8.64e7).toISOString(), album: { ...al, tracks: page([]) } })));
  else if (p.startsWith("/me/tracks")) out = page(tracks.map((t, i) => ({ added_at: new Date(Date.now() - i * 8.64e7).toISOString(), track: t })));
  else if (p.startsWith("/me/library/contains")) out = (new URLSearchParams(p.split("?")[1]).get("uris") ?? "").split(",").map((u) => u.endsWith("0") || u.endsWith("5"));
  else if (p.startsWith("/me/library")) out = undefined;
  else if (p === "/me") out = { id: "demo", display_name: "Dylan", product: "premium" };
  else if (p.match(/^\/playlists\/[^/]+\/items/) && _init.method) out = { snapshot_id: "demo" };
  else if (p.startsWith("/playlists/")) out = playlists.find((x) => x.id === id) ?? playlists[0];
  else if (p.startsWith("/albums/")) {
    const al = albums.find((x) => x.id === id) ?? albums[0];
    out = { ...al, label: "Demo Records", total_tracks: 6, tracks: page(tracks.filter((t) => t.album.id === al.id).concat(tracks.slice(0, 4))) } satisfies Album;
  } else if (p.match(/^\/artists\/[^/]+\/albums/)) out = page(albums.filter((_, i) => i % 2 === Number(id.slice(2)) % 2));
  else if (p.startsWith("/artists/")) out = artists.find((x) => x.id === id) ?? artists[0];
  else if (p.startsWith("/search")) {
    const q = (new URLSearchParams(p.split("?")[1]).get("q") ?? "").toLowerCase();
    const has = (s: string) => s.toLowerCase().includes(q.replace(/^(track|artist):/, "").replace(/"/g, ""));
    out = {
      tracks: page(tracks.filter((t) => has(t.name) || has(t.artists[0].name)).concat(tracks).slice(0, 10)),
      artists: page(artists.slice(0, 6)), albums: page(albums.slice(0, 8)), playlists: page(playlists.slice(0, 4)),
    };
  } else if (p.startsWith("/me/player/queue")) out = { currently_playing: tracks[0], queue: tracks.slice(1, 8) };
  return out as T;
}

const verses = [
  ["Headlights pulling ribbons through the rain", "Every sign we pass forgets our names", "I keep the window down to hear it hum", "The city sounding like a distant drum"],
  ["And we don't need to know where this is going", "Half the fun is never really knowing", "Turn it up and let the static sing", "Hold on tight to every little thing"],
  ["Morning comes in colors we can't name", "Painting all the corners of the frame", "I'll remember this when we are old", "Silver light and stories left untold"],
];

export function demoLyrics(id: string): string {
  const n = Number(id.replace(/\D/g, "")) || 0;
  const lines: string[] = [];
  let t = 6;
  const order = [0, 1, 2, 1, 1];
  order.forEach((v, i) => {
    verses[(v + n) % verses.length].forEach((text) => {
      lines.push(`[${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}]${text}`);
      t += 4.2 + ((text.length * 7 + n) % 9) / 10;
    });
    if (i < order.length - 1) {
      lines.push(`[${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}]`);
      t += 5;
    }
  });
  return lines.join("\n");
}
