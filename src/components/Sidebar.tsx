import { href, useAsync, type Route } from "../lib/hooks";
import { pickImage, spotify } from "../lib/spotify";
import { player } from "../lib/player";
import { useStore } from "../lib/store";
import { Icon, type IconName } from "./Icon";
import { Equalizer } from "./TrackList";

function NavLink({ to, icon, label, active }: { to: string; icon: IconName; label: string; active: boolean }) {
  return (
    <a className={`nav-link${active ? " active" : ""}`} href={to} aria-current={active ? "page" : undefined}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </a>
  );
}

export function Sidebar({ route }: { route: Route }) {
  const playlists = useAsync("playlists", () => spotify.myPlaylists());
  const contextUri = useStore(player, (s) => s.contextUri);
  const paused = useStore(player, (s) => s.paused);

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

      <h2 className="nav-heading">Playlists</h2>
      <div className="nav-playlists">
        {playlists.data?.items.filter(Boolean).map((p) => {
          const active = route.page === "playlist" && route.id === p.id;
          const playing = contextUri === p.uri;
          return (
            <a key={p.id} href={href.playlist(p.id)} className={`nav-playlist${active ? " active" : ""}`}>
              {pickImage(p.images, 60) ? <img src={pickImage(p.images, 60)} alt="" loading="lazy" /> : <span className="cover-blank" />}
              <span className="nav-playlist-name">{p.name}</span>
              {playing && !paused && <Equalizer />}
            </a>
          );
        })}
        {playlists.error && <p className="fine-print">Couldn't load your playlists.</p>}
      </div>

      <NavLink to={href.settings()} icon="settings" label="Settings" active={route.page === "settings"} />
    </nav>
  );
}
