import { useState } from "react";
import { href, library, useAsync, type Route } from "../lib/hooks";
import { pickImage, spotify } from "../lib/spotify";
import { player } from "../lib/player";
import { useStore } from "../lib/store";
import { Icon, type IconName } from "./Icon";
import { Equalizer } from "./TrackList";
import { newPlaylist } from "./AddToPlaylist";

function NavLink({ to, icon, label, active }: { to: string; icon: IconName; label: string; active: boolean }) {
  return (
    <a className={`nav-link${active ? " active" : ""}`} href={to} aria-current={active ? "page" : undefined}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </a>
  );
}

type Tab = "playlists" | "albums";
const TAB_KEY = "afterglow.libraryTab";

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === "albums" ? "albums" : "playlists";
  } catch {
    return "playlists";
  }
}

function Item({ to, image, name, sub, active, playing }: { to: string; image?: string; name: string; sub?: string; active: boolean; playing: boolean }) {
  return (
    <a href={to} className={`nav-playlist${active ? " active" : ""}`}>
      {image ? <img src={image} alt="" loading="lazy" /> : <span className="cover-blank" />}
      <span className="nav-playlist-text">
        <span className="nav-playlist-name">{name}</span>
        {sub && <span className="nav-playlist-sub">{sub}</span>}
      </span>
      {playing && <Equalizer />}
    </a>
  );
}

export function Sidebar({ route }: { route: Route }) {
  const [tab, setTab] = useState<Tab>(readTab);
  const libraryV = useStore(library, (l) => l.v);
  const playlistsV = useStore(library, (l) => l.p);
  const playlists = useAsync(`playlists:${playlistsV}`, spotify.allPlaylists);
  const albums = useAsync(tab === "albums" ? `albums:${libraryV}` : null, spotify.allAlbums);
  const contextUri = useStore(player, (s) => s.contextUri);
  const paused = useStore(player, (s) => s.paused);

  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* fine, it just won't be remembered */
    }
  };

  return (
    <nav className="sidebar glass" aria-label="Main">
      <a className="brand" href={href.home()}>
        <span className="brand-mark" aria-hidden="true" />
        Afterglow
      </a>
      <div className="nav-main">
        <NavLink to={href.home()} icon="home" label="Home" active={route.page === "home"} />
        <NavLink to={href.search()} icon="search" label="Search" active={route.page === "search"} />
        <NavLink to={href.liked()} icon="heart" label="Liked songs" active={route.page === "liked"} />
      </div>

      <div className="nav-tabs" role="tablist" aria-label="Your library">
        {(["playlists", "albums"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => pick(t)}>
            {t === "playlists" ? "Playlists" : "Albums"}
          </button>
        ))}
        <button className="icon-btn nav-new" onClick={newPlaylist} aria-label="New playlist" title="New playlist">
          <Icon name="plus" size={18} />
        </button>
      </div>
      <div className="nav-playlists" role="tabpanel">
        {tab === "playlists" &&
          playlists.data?.items.map((p) => (
            <Item
              key={p.id}
              to={href.playlist(p.id)}
              image={pickImage(p.images, 60)}
              name={p.name}
              active={route.page === "playlist" && route.id === p.id}
              playing={contextUri === p.uri && !paused}
            />
          ))}
        {tab === "playlists" && playlists.error && <p className="fine-print">Couldn't load your playlists.</p>}

        {tab === "albums" &&
          albums.data?.map((a) => (
            <Item
              key={a.id}
              to={href.album(a.id)}
              image={pickImage(a.images, 60)}
              name={a.name}
              sub={a.artists?.map((x) => x.name).join(", ")}
              active={route.page === "album" && route.id === a.id}
              playing={contextUri === a.uri && !paused}
            />
          ))}
        {tab === "albums" && albums.data?.length === 0 && <p className="fine-print">Albums you save show up here. Tap the heart on any album.</p>}
        {tab === "albums" && albums.error && <p className="fine-print">Couldn't load your albums.</p>}
      </div>

      <NavLink to={href.settings()} icon="settings" label="Settings" active={route.page === "settings"} />
    </nav>
  );
}
