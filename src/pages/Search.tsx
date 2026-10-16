import { useEffect, useRef, useState } from "react";
import { href, useAsync, useDebounced } from "../lib/hooks";
import { controls } from "../lib/player";
import { pickImage, spotify, type Playlist } from "../lib/spotify";
import { TrackList } from "../components/TrackList";
import { Shelf } from "../components/Shelf";
import { Tile } from "../components/Tile";
import { Icon } from "../components/Icon";

export function SearchPage({ q }: { q: string }) {
  const [text, setText] = useState(q);
  const input = useRef<HTMLInputElement>(null);
  const query = useDebounced(text.trim(), 300);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    // Keep the address bar in sync so back/forward works.
    const target = href.search(query);
    if (location.hash !== target) history.replaceState(null, "", target);
  }, [query]);

  const { data, loading, error } = useAsync(query ? `search:${query}` : null, () => spotify.search(query));
  const tracks = data?.tracks?.items ?? [];
  const playlists = (data?.playlists?.items ?? []).filter((p): p is Playlist => !!p);

  return (
    <div className="page search">
      <label className="search-box">
        <Icon name="search" size={22} />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Songs, artists, albums or playlists"
          aria-label="Search Spotify"
        />
        {text && (
          <button className="icon-btn" onClick={() => setText("")} aria-label="Clear search">
            <Icon name="close" size={18} />
          </button>
        )}
      </label>

      {!query && <p className="empty">Search all of Spotify. Results show up as you type.</p>}
      {error && <p className="inline-note">Search didn't work: {error.message}</p>}
      {query && loading && <p className="empty">Searching…</p>}
      {query && data && !tracks.length && !data.artists?.items.length && <p className="empty">Nothing found for "{query}".</p>}

      {tracks.length > 0 && (
        <section className="search-songs">
          <h2>Songs</h2>
          <TrackList tracks={tracks} onPlay={(i) => controls.playUris(tracks.map((t) => t.uri), i)} />
        </section>
      )}
      {!!data?.artists?.items.length && (
        <Shelf title="Artists">
          {data.artists.items.map((a) => (
            <Tile key={a.id} round title={a.name} subtitle="Artist" image={pickImage(a.images)} href={href.artist(a.id)} onPlay={() => controls.playContext(a.uri)} />
          ))}
        </Shelf>
      )}
      {!!data?.albums?.items.length && (
        <Shelf title="Albums">
          {data.albums.items.map((a) => (
            <Tile
              key={a.id}
              title={a.name}
              subtitle={a.artists?.map((x) => x.name).join(", ")}
              image={pickImage(a.images)}
              href={href.album(a.id)}
              onPlay={() => controls.playContext(a.uri)}
            />
          ))}
        </Shelf>
      )}
      {playlists.length > 0 && (
        <Shelf title="Playlists">
          {playlists.map((p) => (
            <Tile key={p.id} title={p.name} subtitle={p.owner.display_name} image={pickImage(p.images)} href={href.playlist(p.id)} onPlay={() => controls.playContext(p.uri)} />
          ))}
        </Shelf>
      )}
    </div>
  );
}
