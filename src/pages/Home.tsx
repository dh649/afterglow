import { useMemo } from "react";
import { greeting, href, library, useAsync } from "../lib/hooks";
import { controls, player } from "../lib/player";
import { settings } from "../lib/settings";
import { useStore } from "../lib/store";
import { forYou } from "../lib/lastfm";
import { idFromUri, pickImage, playlistCount, spotify, typeFromUri, type Track } from "../lib/spotify";
import { Shelf, ShelfSkeleton } from "../components/Shelf";
import { Tile } from "../components/Tile";
import { Icon } from "../components/Icon";

interface Spot { uri: string; name: string; image?: string; link: string }

function useJumpBackIn(recent: { track: Track; context: { uri: string; type: string } | null }[] | undefined) {
  const contexts = useMemo(() => {
    const seen = new Set<string>();
    const out: { uri: string; track: Track }[] = [];
    for (const r of recent ?? []) {
      const uri = r.context?.uri ?? r.track.album.uri;
      if (seen.has(uri) || uri.includes(":collection")) continue;
      seen.add(uri);
      out.push({ uri, track: r.track });
      if (out.length === 6) break;
    }
    return out;
  }, [recent]);

  return useAsync<Spot[]>(contexts.length ? `jump:${contexts.map((c) => c.uri).join()}` : null, () =>
    Promise.all(
      contexts.map(async ({ uri, track }): Promise<Spot | null> => {
        const type = typeFromUri(uri);
        const id = idFromUri(uri);
        try {
          if (type === "album")
            return { uri, name: track.album.name, image: pickImage(track.album.images, 120), link: href.album(id) };
          if (type === "playlist") {
            const p = await spotify.playlist(id);
            return { uri, name: p.name, image: pickImage(p.images, 120), link: href.playlist(id) };
          }
          if (type === "artist") {
            const a = await spotify.artist(id);
            return { uri, name: a.name, image: pickImage(a.images, 120), link: href.artist(id) };
          }
        } catch {
          /* a deleted or private playlist: skip it */
        }
        return null;
      }),
    ).then((list) => list.filter((x): x is Spot => !!x)),
  );
}

export function Home() {
  const name = useAsync("me", spotify.me).data?.display_name?.split(" ")[0];
  const recent = useAsync("recent", spotify.recentlyPlayed);
  const topTracks = useAsync("top:tracks", () => spotify.top("tracks", "short_term", 20));
  const topArtists = useAsync("top:artists", () => spotify.top("artists", "medium_term", 20));
  const playlistsV = useStore(library, (l) => l.p);
  const playlists = useAsync(`playlists:${playlistsV}`, spotify.allPlaylists);
  const libraryV = useStore(library, (l) => l.v);
  const albums = useAsync(`albums:${libraryV}`, spotify.allAlbums);
  const lastfmKey = useStore(settings, (s) => s.lastfmKey);
  const contextUri = useStore(player, (s) => s.contextUri);

  const recentTracks = useMemo(() => {
    const seen = new Set<string>();
    return (recent.data?.items ?? []).map((r) => r.track).filter((t) => !seen.has(t.id) && !!seen.add(t.id));
  }, [recent.data]);

  const seeds = (topTracks.data?.items.length ? topTracks.data.items : recentTracks).slice(0, 4);
  const suggestions = useAsync(
    lastfmKey && seeds.length ? `foryou:${lastfmKey}:${seeds.map((s) => s.id).join()}` : null,
    () => forYou(lastfmKey, seeds),
  );

  const jump = useJumpBackIn(recent.data?.items);

  return (
    <div className="page home">
      <h1 className="greeting">
        {greeting()}
        {name ? `, ${name}` : ""}
      </h1>

      {jump.data && jump.data.length > 0 && (
        <div className="jump-grid">
          {jump.data.map((s) => (
            <a className={`jump${contextUri === s.uri ? " active" : ""}`} href={s.link} key={s.uri}>
              {s.image ? <img src={s.image} alt="" /> : <span className="cover-blank" />}
              <span className="jump-name">{s.name}</span>
              <button
                className="jump-play"
                aria-label={`Play ${s.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  controls.playContext(s.uri);
                }}
              >
                <Icon name="play" size={18} />
              </button>
            </a>
          ))}
        </div>
      )}

      {lastfmKey ? (
        suggestions.loading ? (
          <ShelfSkeleton title="For you" />
        ) : suggestions.error ? (
          <p className="inline-note">
            Couldn't load suggestions: {suggestions.error.message}. Check your Last.fm key in <a href={href.settings()}>Settings</a>.
          </p>
        ) : (
          !!suggestions.data?.length && (
            <Shelf title="For you" note="Similar to what you've been playing">
              {suggestions.data.map((t, i) => (
                <Tile
                  key={t.id}
                  title={t.name}
                  subtitle={t.artists.map((a) => a.name).join(", ")}
                  image={pickImage(t.album.images)}
                  href={href.album(t.album.id)}
                  onPlay={() => controls.playUris(suggestions.data!.map((x) => x.uri), i)}
                />
              ))}
            </Shelf>
          )
        )
      ) : (
        <a className="nudge" href={href.settings()}>
          <strong>Get song suggestions here</strong>
          <span>Add a free Last.fm key in Settings and this row fills with music similar to what you play.</span>
        </a>
      )}

      {recent.loading ? (
        <ShelfSkeleton title="Recently played" />
      ) : (
        recentTracks.length > 0 && (
          <Shelf title="Recently played">
            {recentTracks.map((t, i) => (
              <Tile
                key={t.id}
                title={t.name}
                subtitle={t.artists.map((a) => a.name).join(", ")}
                image={pickImage(t.album.images)}
                href={href.album(t.album.id)}
                onPlay={() => controls.playUris(recentTracks.map((x) => x.uri), i)}
              />
            ))}
          </Shelf>
        )
      )}

      {!!topTracks.data?.items.length && (
        <Shelf title="On repeat" note="Your most played this month">
          {topTracks.data.items.map((t, i) => (
            <Tile
              key={t.id}
              title={t.name}
              subtitle={t.artists.map((a) => a.name).join(", ")}
              image={pickImage(t.album.images)}
              href={href.album(t.album.id)}
              onPlay={() => controls.playUris(topTracks.data!.items.map((x) => x.uri), i)}
            />
          ))}
        </Shelf>
      )}

      {!!topArtists.data?.items.length && (
        <Shelf title="Your top artists">
          {topArtists.data.items.map((a) => (
            <Tile
              key={a.id}
              round
              title={a.name}
              subtitle="Artist"
              image={pickImage(a.images)}
              href={href.artist(a.id)}
              active={contextUri === a.uri}
              onPlay={() => controls.playContext(a.uri)}
            />
          ))}
        </Shelf>
      )}

      {!!playlists.data?.items.length && (
        <Shelf title="Your playlists">
          {playlists.data.items.filter(Boolean).map((p) => {
            const count = playlistCount(p);
            return (
              <Tile
                key={p.id}
                title={p.name}
                subtitle={count !== undefined ? `${count} songs` : p.owner.display_name}
                image={pickImage(p.images)}
                href={href.playlist(p.id)}
                active={contextUri === p.uri}
                onPlay={() => controls.playContext(p.uri)}
              />
            );
          })}
        </Shelf>
      )}

      {!!albums.data?.length && (
        <Shelf title="Your albums">
          {albums.data.map((a) => (
            <Tile
              key={a.id}
              title={a.name}
              subtitle={a.artists?.map((x) => x.name).join(", ")}
              image={pickImage(a.images)}
              href={href.album(a.id)}
              active={contextUri === a.uri}
              onPlay={() => controls.playContext(a.uri)}
            />
          ))}
        </Shelf>
      )}

      {recent.error && topTracks.error && playlists.error && (
        <p className="inline-note">Spotify didn't send anything back. Try refreshing in a minute.</p>
      )}
    </div>
  );
}
