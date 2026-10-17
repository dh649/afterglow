import { useEffect, useRef } from "react";
import { useAsync, formatTime } from "../lib/hooks";
import { player, queueVersion } from "../lib/player";
import { pickImage, spotify, type Track } from "../lib/spotify";
import { useStore } from "../lib/store";
import { Icon } from "./Icon";
import { Artists, Equalizer } from "./TrackList";

function Row({ t, now }: { t: Track; now?: boolean }) {
  return (
    <li className={`q-row${now ? " now" : ""}`}>
      <img src={pickImage(t.album?.images, 64)} alt="" loading="lazy" />
      <span className="q-text">
        <span className="q-name">{t.name}</span>
        <span className="q-artists">
          <Artists artists={t.artists} />
        </span>
      </span>
      {now ? <Equalizer /> : <span className="q-time">{formatTime(t.duration_ms)}</span>}
    </li>
  );
}

/** Everything coming up next, from Spotify's queue (songs you added, then the rest of the playlist or album). */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const trackUri = useStore(player, (s) => s.track?.uri ?? "none");
  const version = useStore(queueVersion, (q) => q.n);
  const { data, loading, error } = useAsync(`queue:${trackUri}:${version}`, spotify.queue);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => closeBtn.current?.focus(), []);

  // Spotify can send episodes or deleted songs in the queue; skip anything without an album.
  const upcoming = (data?.queue ?? []).filter((t): t is Track => !!t?.album);
  const current = data?.currently_playing?.album ? data.currently_playing : null;

  return (
    <aside className="queue-panel glass" aria-label="Queue">
      <header className="q-head">
        <h2>Queue</h2>
        <button ref={closeBtn} className="icon-btn" onClick={onClose} aria-label="Close queue" title="Close (Q)">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="q-body">
        {loading && !data && <p className="q-msg">Loading the queue…</p>}
        {error && <p className="q-msg">Couldn't load the queue. Try again in a moment.</p>}
        {current && (
          <>
            <h3>Now playing</h3>
            <ol className="q-list">
              <Row t={current} now />
            </ol>
          </>
        )}
        {data && (
          <>
            <h3>Next up</h3>
            {upcoming.length ? (
              <ol className="q-list">
                {upcoming.map((t, i) => (
                  <Row key={t.uri + i} t={t} />
                ))}
              </ol>
            ) : (
              <p className="q-msg">Nothing's coming up. Use the queue button on any song to add it here.</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
