import { useEffect, useRef } from "react";
import { player } from "../lib/player";
import { useStore } from "../lib/store";
import { href } from "../lib/hooks";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { Lyrics } from "./Lyrics";
import { Artists } from "./TrackList";
import { Timeline, Transport } from "./PlayerBar";

/** Full-screen view: big cover and controls on the left, live lyrics on the right. */
export function NowPlaying({ onClose }: { onClose: () => void }) {
  const track = useStore(player, (s) => s.track);
  const upNext = useStore(player, (s) => s.upNext);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="now-playing" role="dialog" aria-modal="true" aria-label="Now playing">
      <button ref={closeBtn} className="icon-btn np-close" onClick={onClose} aria-label="Close now playing" title="Close (Esc)">
        <Icon name="down" size={26} />
      </button>

      {track ? (
        <>
          <section className="np-left">
            <div className="np-cover">{track.album.image && <img src={track.album.image} alt={`${track.album.name} cover`} />}</div>
            <div className="np-titles">
              <div>
                <h1>{track.name}</h1>
                <p>
                  <Artists artists={track.artists} />
                  <span className="np-album">
                    {" "}on{" "}
                    <a href={href.album(track.album.id)} onClick={onClose}>
                      {track.album.name}
                    </a>
                  </span>
                </p>
              </div>
              <LikeButton uri={track.uri} label="song" size={24} />
            </div>
            <Timeline />
            <Transport size="big" />
            {upNext.length > 0 && (
              <div className="np-next">
                <span className="np-next-label">Up next</span>
                {upNext.slice(0, 2).map((t) => (
                  <div className="np-next-row" key={t.uri}>
                    {t.album.imageSmall && <img src={t.album.imageSmall} alt="" />}
                    <span>
                      <strong>{t.name}</strong>
                      <small>{t.artists.map((a) => a.name).join(", ")}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="np-right">
            <Lyrics track={track} />
          </section>
        </>
      ) : (
        <p className="lyrics-msg">Nothing's playing yet.</p>
      )}
    </div>
  );
}
