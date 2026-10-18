import { useEffect, useState } from "react";
import { useAsync, href, invalidate, library } from "../lib/hooks";
import { useStore } from "../lib/store";
import { toast } from "../components/Toast";
import { controls } from "../lib/player";
import { pickImage, playlistCount, playlistTracks, spotify, type Paging, type Track } from "../lib/spotify";
import { CollectionHeader, HeaderSkeleton, totalDuration } from "../components/CollectionHeader";
import { TrackList, TrackListSkeleton } from "../components/TrackList";
import { Shelf, ShelfSkeleton } from "../components/Shelf";
import { Tile } from "../components/Tile";
import { LikeButton } from "../components/LikeButton";

function Failed({ what, error }: { what: string; error: Error }) {
  return (
    <div className="page">
      <p className="inline-note">
        Couldn't open this {what}: {error.message}. <a href={href.home()}>Go home</a>
      </p>
    </div>
  );
}

const shuffleOn = async (play: () => unknown) => {
  await controls.setShuffle(true);
  await play();
};

/* ---------- Playlist ---------- */

export function PlaylistPage({ id }: { id: string }) {
  const version = useStore(library, (l) => l.p);
  const { data: p, error } = useAsync(`playlist:${id}:${version}`, () => spotify.playlist(id));
  const me = useAsync("me", spotify.me).data;
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Track[]>([]);
  const first = p ? playlistTracks(p) : null;

  // Load the remaining pages of songs for long playlists.
  useEffect(() => {
    setMore([]);
    if (!p) return;
    let next = ((p.items ?? p.tracks) as Paging<unknown> | undefined)?.next ?? null;
    let live = true;
    (async () => {
      while (next && live) {
        const page = await spotify.page<{ item?: Track | null; track?: Track | null }>(next).catch(() => null);
        if (!page) break;
        const songs = page.items.map((x) => x.item ?? x.track).filter((t): t is Track => !!t?.id);
        if (live) setMore((m) => [...m, ...songs]);
        next = page.next;
      }
    })();
    return () => {
      live = false;
    };
  }, [p]);

  if (error) return <Failed what="playlist" error={error} />;
  if (!p) return <div className="page"><HeaderSkeleton /><TrackListSkeleton /></div>;

  const tracks = first ? [...first, ...more].filter((t) => !removed.has(t.uri)) : null;
  const yours = !!me && (p.owner.id === me.id || !!p.collaborative);

  const remove = async (t: Track) => {
    setRemoved((r) => new Set(r).add(t.uri));
    try {
      await spotify.removeFromPlaylist(p.id, [t.uri]);
      invalidate("playlists");
      toast(`Removed "${t.name}" from ${p.name}`);
    } catch (e) {
      setRemoved((r) => {
        const next = new Set(r);
        next.delete(t.uri);
        return next;
      });
      const err = e as Error;
      toast(/scope|permission/i.test(err.message) ? "Reconnect Spotify to edit playlists: use + on any song." : `Couldn't remove it: ${err.message}`);
    }
  };
  const count = playlistCount(p) ?? tracks?.length;
  return (
    <div className="page">
      <CollectionHeader
        kind="Playlist"
        title={p.name}
        image={pickImage(p.images, 400)}
        description={p.description?.replace(/<[^>]+>/g, "")}
        contextUri={p.uri}
        meta={
          <>
            <span>{p.owner.display_name}</span>
            {count !== undefined && <span>{count} songs</span>}
            {tracks && <span>{totalDuration(tracks.reduce((n, t) => n + t.duration_ms, 0))}</span>}
          </>
        }
        onPlay={() => controls.playContext(p.uri)}
        onShuffle={() => shuffleOn(() => controls.playContext(p.uri))}
      />
      {tracks ? (
        <TrackList
          tracks={tracks}
          onPlay={(i) => controls.playContext(p.uri, { uri: tracks[i].uri })}
          onRemove={yours ? (t) => void remove(t) : undefined}
        />
      ) : (
        <p className="inline-note">
          Spotify only shares the song list for playlists you made or collaborate on. Press play and it'll still play here.
        </p>
      )}
    </div>
  );
}

/* ---------- Album ---------- */

export function AlbumPage({ id }: { id: string }) {
  const { data: a, error } = useAsync(`album:${id}`, () => spotify.album(id));
  if (error) return <Failed what="album" error={error} />;
  if (!a) return <div className="page"><HeaderSkeleton /><TrackListSkeleton /></div>;

  const tracks: Track[] = a.tracks.items.map((t) => ({ ...t, album: a }));
  return (
    <div className="page">
      <CollectionHeader
        kind={a.album_type === "single" ? "Single" : "Album"}
        title={a.name}
        image={pickImage(a.images, 400)}
        contextUri={a.uri}
        meta={
          <>
            {a.artists?.map((ar) => (
              <a key={ar.id} href={href.artist(ar.id)}>
                {ar.name}
              </a>
            ))}
            {a.release_date && <span>{a.release_date.slice(0, 4)}</span>}
            <span>{a.total_tracks ?? tracks.length} songs</span>
            <span>{totalDuration(tracks.reduce((n, t) => n + t.duration_ms, 0))}</span>
          </>
        }
        onPlay={() => controls.playContext(a.uri)}
        onShuffle={() => shuffleOn(() => controls.playContext(a.uri))}
        extra={<LikeButton uri={a.uri} label="album" />}
      />
      <TrackList tracks={tracks} showCover={false} showAlbum={false} onPlay={(i) => controls.playContext(a.uri, { position: i })} />
      {a.label && <p className="fine-print">{a.label}</p>}
    </div>
  );
}

/* ---------- Artist ---------- */

export function ArtistPage({ id }: { id: string }) {
  const { data: a, error } = useAsync(`artist:${id}`, () => spotify.artist(id));
  const releases = useAsync(`artist-albums:${id}`, () => spotify.artistAlbums(id));
  const songs = useAsync(a ? `artist-songs:${id}` : null, () => spotify.artistSongs(a!));
  const [showAll, setShowAll] = useState(false);
  if (error) return <Failed what="artist" error={error} />;
  if (!a) return <div className="page"><HeaderSkeleton /><TrackListSkeleton rows={5} /></div>;

  const albums = releases.data?.items.filter((r) => r.album_type !== "single") ?? [];
  const singles = releases.data?.items.filter((r) => r.album_type === "single") ?? [];
  const popular = songs.data ?? [];
  const shown = showAll ? popular : popular.slice(0, 5);
  return (
    <div className="page">
      <CollectionHeader
        kind="Artist"
        title={a.name}
        image={pickImage(a.images, 400)}
        round
        contextUri={a.uri}
        meta={a.genres?.length ? <span>{a.genres.slice(0, 3).join(", ")}</span> : undefined}
        onPlay={() => controls.playContext(a.uri)}
      />

      {songs.loading && !songs.data && <TrackListSkeleton rows={5} />}
      {popular.length > 0 && (
        <section className="artist-popular">
          <h2>Popular</h2>
          <TrackList tracks={shown} onPlay={(i) => controls.playUris(popular.map((t) => t.uri), i)} />
          {popular.length > 5 && (
            <button className="text-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : "Show more"}
            </button>
          )}
        </section>
      )}

      {releases.loading && !releases.data && <ShelfSkeleton title="Albums" />}
      {albums.length > 0 && (
        <Shelf title="Albums">
          {albums.map((r) => (
            <Tile key={r.id} title={r.name} subtitle={r.release_date?.slice(0, 4)} image={pickImage(r.images)} href={href.album(r.id)} onPlay={() => controls.playContext(r.uri)} />
          ))}
        </Shelf>
      )}
      {singles.length > 0 && (
        <Shelf title="Singles and EPs">
          {singles.map((r) => (
            <Tile key={r.id} title={r.name} subtitle={r.release_date?.slice(0, 4)} image={pickImage(r.images)} href={href.album(r.id)} onPlay={() => controls.playContext(r.uri)} />
          ))}
        </Shelf>
      )}
      {releases.error && <p className="inline-note">Couldn't load this artist's music: {releases.error.message}</p>}
      {releases.data && !albums.length && !singles.length && !popular.length && (
        <p className="inline-note">Spotify didn't send any music for this artist. Press play to hear them anyway.</p>
      )}
    </div>
  );
}

/* ---------- Liked songs ---------- */

export function LikedPage() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (offset: number) => {
    setLoading(true);
    try {
      const page = await spotify.liked(offset);
      setTracks((t) => [...(offset ? (t ?? []) : []), ...page.items.map((x) => x.track)]);
      setTotal(page.total);
      setNext(page.next ? offset + page.items.length : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(0);
  }, []);

  if (error && !tracks) return <Failed what="list" error={new Error(error)} />;
  const uris = tracks?.map((t) => t.uri) ?? [];
  return (
    <div className="page">
      <CollectionHeader
        kind="Playlist"
        title="Liked songs"
        meta={<span>{total} songs</span>}
        onPlay={() => controls.playUris(uris, 0)}
        onShuffle={() => controls.playUris([...uris].sort(() => Math.random() - 0.5), 0)}
      />
      {tracks ? <TrackList tracks={tracks} onPlay={(i) => controls.playUris(uris, i)} /> : <TrackListSkeleton />}
      {next !== null && tracks && (
        <button className="pill-btn load-more" onClick={() => load(next)} disabled={loading}>
          {loading ? "Loading…" : "Show more"}
        </button>
      )}
    </div>
  );
}
