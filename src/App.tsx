import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "./lib/auth";
import { albumColors } from "./lib/color";
import { href, useRoute } from "./lib/hooks";
import { connectPlayer, controls, player } from "./lib/player";
import { settings } from "./lib/settings";
import { useStore } from "./lib/store";
import { Background } from "./components/Background";
import { Sidebar } from "./components/Sidebar";
import { PlayerBar } from "./components/PlayerBar";
import { NowPlaying } from "./components/NowPlaying";
import { Toasts } from "./components/Toast";
import { MiniPlayerPortal } from "./components/MiniPlayer";
import { Setup } from "./pages/Setup";
import { Home } from "./pages/Home";
import { SearchPage } from "./pages/Search";
import { AlbumPage, ArtistPage, LikedPage, PlaylistPage } from "./pages/Collections";
import { SettingsPage } from "./pages/Settings";

/** Album-driven accent color, panel opacity, and the tab icon. */
function useTheme() {
  const image = useStore(player, (s) => s.track?.album.image);
  const small = useStore(player, (s) => s.track?.album.imageSmall);
  const albumAccent = useStore(settings, (s) => s.albumAccent);
  const glass = useStore(settings, (s) => s.glass);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--glass", String(glass));
    let live = true;
    albumColors(albumAccent ? image : undefined).then((c) => {
      if (!live) return;
      root.setProperty("--accent", albumAccent ? c.accent : "#ff8fa3");
      root.setProperty("--glow", c.glow);
    });
    return () => {
      live = false;
    };
  }, [image, albumAccent, glass]);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel=icon]");
    if (link) link.href = small ?? "./icon.svg";
  }, [small]);

  const title = useStore(player, (s) => (s.track && !s.paused ? `${s.track.name} · ${s.track.artists[0]?.name}` : "Afterglow"));
  useEffect(() => {
    document.title = title;
  }, [title]);
}

function Shell() {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  useTheme();

  useEffect(connectPlayer, []);
  useEffect(() => main.current?.scrollTo({ top: 0 }), [route.page, "id" in route ? route.id : ""]);

  const toggleOpen = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  // Keyboard shortcuts, ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space" && !el.closest("button, a, [role=button], li")) {
        e.preventDefault();
        controls.toggle();
      } else if (e.key === "l" || e.key === "L") toggleOpen();
      else if (e.key === "n" || e.key === "N") controls.next();
      else if (e.key === "p" || e.key === "P") controls.prev();
      else if (e.key === "/") {
        e.preventDefault();
        location.hash = href.search();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [toggleOpen]);

  // Following a link from the now-playing view should close it.
  useEffect(close, [route.page, "id" in route ? route.id : "", close]);

  return (
    <>
      <Background />
      <div className={`shell${open ? " np-open" : ""}`}>
        <Sidebar route={route} />
        <main className="main glass" ref={main}>
          {route.page === "home" && <Home />}
          {route.page === "search" && <SearchPage q={route.q} />}
          {route.page === "liked" && <LikedPage />}
          {route.page === "playlist" && <PlaylistPage id={route.id} key={route.id} />}
          {route.page === "album" && <AlbumPage id={route.id} key={route.id} />}
          {route.page === "artist" && <ArtistPage id={route.id} key={route.id} />}
          {route.page === "settings" && <SettingsPage />}
        </main>
        <PlayerBar onOpen={toggleOpen} open={open} />
      </div>
      {open && <NowPlaying onClose={close} />}
      <Toasts />
      <MiniPlayerPortal />
    </>
  );
}

export function App() {
  const loggedIn = useStore(auth, (a) => a.loggedIn);
  if (!loggedIn) {
    return (
      <>
        <Background />
        <Setup />
      </>
    );
  }
  return <Shell />;
}
