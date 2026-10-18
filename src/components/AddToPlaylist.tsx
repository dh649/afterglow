import { useEffect, useMemo, useRef, useState } from "react";
import { canEditPlaylists, login } from "../lib/auth";
import { bumpPlaylists, href, invalidate, library, useAsync } from "../lib/hooks";
import { ApiError, pickImage, playlistCount, spotify, type Playlist } from "../lib/spotify";
import { createStore, useStore } from "../lib/store";
import { Icon } from "./Icon";
import { toast } from "./Toast";

/**
 * "Add to playlist" window. Open it from anywhere with addToPlaylist(...).
 * Every change goes straight to Spotify, so it shows up in the Spotify app too.
 */

interface Target {
  uris: string[];
  /** What's being added, for the title ("Kite String"). Empty means "create a playlist". */
  label: string;
}

const dialog = createStore<{ target: Target | null }>({ target: null });

export function addToPlaylist(uris: string[], label: string) {
  dialog.set({ target: { uris, label } });
}

export function newPlaylist() {
  dialog.set({ target: { uris: [], label: "" } });
}

const close = () => dialog.set({ target: null });

/** Spotify's answer when the login is missing the "edit playlists" permission. */
const isPermissionError = (e: unknown) => e instanceof ApiError && (e.status === 403 || e.status === 401) && /scope|permission/i.test(e.message);

export function AddToPlaylistDialog() {
  const target = useStore(dialog, (d) => d.target);
  if (!target) return null;
  return <Dialog target={target} />;
}

function Dialog({ target }: { target: Target }) {
  const creatingOnly = target.uris.length === 0;
  const p = useStore(library, (l) => l.p);
  const me = useAsync("me", spotify.me).data;
  const playlists = useAsync(`playlists:${p}`, spotify.allPlaylists);
  const [filter, setFilter] = useState("");
  const [making, setMaking] = useState(creatingOnly);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(!canEditPlaylists());
  const box = useRef<HTMLDivElement>(null);

  // Only playlists you own or collaborate on can be changed.
  const editable = useMemo(
    () =>
      (playlists.data?.items ?? []).filter(
        (pl) => (me && pl.owner.id === me.id) || pl.collaborative,
      ),
    [playlists.data, me],
  );
  const shown = filter ? editable.filter((pl) => pl.name.toLowerCase().includes(filter.toLowerCase())) : editable;

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [making]);

  const fail = (e: unknown) => {
    if (isPermissionError(e)) setNeedsReconnect(true);
    else toast(`Spotify didn't accept that: ${(e as Error).message}`);
  };

  const addTo = async (pl: Playlist) => {
    setBusy(true);
    try {
      await spotify.addToPlaylist(pl.id, target.uris);
      invalidate(`playlist:${pl.id}`);
      bumpPlaylists();
      toast(target.uris.length === 1 ? `Added to ${pl.name}` : `Added ${target.uris.length} songs to ${pl.name}`);
      close();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const made = await spotify.createPlaylist(n);
      if (target.uris.length) await spotify.addToPlaylist(made.id, target.uris);
      bumpPlaylists();
      toast(target.uris.length ? `Created ${n} and added ${target.uris.length === 1 ? "the song" : "the songs"}` : `Created ${n}`);
      close();
      if (creatingOnly) location.hash = href.playlist(made.id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog glass" role="dialog" aria-modal="true" aria-label={creatingOnly ? "New playlist" : "Add to playlist"} ref={box}>
        <header className="dialog-head">
          <div>
            <h2>{creatingOnly ? "New playlist" : "Add to playlist"}</h2>
            {!creatingOnly && <p className="dialog-sub">{target.label}</p>}
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        {needsReconnect ? (
          <div className="dialog-reconnect">
            <p>To change your playlists, Afterglow needs one more permission from Spotify. You'll go to Spotify and come right back.</p>
            <button className="play-wide" onClick={login}>
              Reconnect Spotify
            </button>
          </div>
        ) : making ? (
          <form className="dialog-create" onSubmit={create}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Playlist name" aria-label="Playlist name" maxLength={100} />
            <div className="dialog-actions">
              {!creatingOnly && (
                <button type="button" className="pill-btn ghost" onClick={() => setMaking(false)}>
                  Back
                </button>
              )}
              <button type="submit" className="pill-btn accent" disabled={!name.trim() || busy}>
                {busy ? "Creating…" : target.uris.length ? "Create and add" : "Create"}
              </button>
            </div>
            <p className="fine-print">New playlists are private. You can share them from Spotify.</p>
          </form>
        ) : (
          <>
            <div className="dialog-tools">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a playlist" aria-label="Find a playlist" />
              <button className="pill-btn" onClick={() => setMaking(true)}>
                <Icon name="plus" size={16} /> New
              </button>
            </div>
            <ul className="dialog-list">
              {playlists.loading && !playlists.data && <li className="q-msg">Loading your playlists…</li>}
              {shown.map((pl) => (
                <li key={pl.id}>
                  <button className="dialog-pick" onClick={() => addTo(pl)} disabled={busy}>
                    {pickImage(pl.images, 60) ? <img src={pickImage(pl.images, 60)} alt="" /> : <span className="cover-blank" />}
                    <span className="q-text">
                      <span className="q-name">{pl.name}</span>
                      <span className="q-artists">{playlistCount(pl) ?? 0} songs</span>
                    </span>
                  </button>
                </li>
              ))}
              {playlists.data && !shown.length && (
                <li className="q-msg">{filter ? "No playlist by that name." : "You don't have any playlists you can edit yet. Make a new one."}</li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
