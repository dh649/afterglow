import { Fragment } from "react";
import { controls, player } from "../lib/player";
import { settings } from "../lib/settings";
import { useStore } from "../lib/store";
import { formatTime, href } from "../lib/hooks";
import { pickImage, type ArtistRef, type Track } from "../lib/spotify";
import { Icon } from "./Icon";
import { toast } from "./Toast";

export function Artists({ artists }: { artists: Pick<ArtistRef, "id" | "name">[] }) {
  return (
    <>
      {artists.map((a, i) => (
        <Fragment key={a.id + i}>
          {i > 0 && ", "}
          <a href={href.artist(a.id)} onClick={(e) => e.stopPropagation()}>
            {a.name}
          </a>
        </Fragment>
      ))}
    </>
  );
}

export function Equalizer() {
  return (
    <span className="eq" aria-label="Now playing">
      <i />
      <i />
      <i />
    </span>
  );
}

interface Props {
  tracks: Track[];
  onPlay: (index: number) => void;
  showCover?: boolean;
  showAlbum?: boolean;
}

export function TrackList({ tracks, onPlay, showCover = true, showAlbum = true }: Props) {
  const current = useStore(player, (s) => s.track?.id);
  const paused = useStore(player, (s) => s.paused);
  const dbl = useStore(settings, (s) => s.doubleClick);

  const queue = (t: Track) => {
    controls.addToQueue(t.uri);
    toast(`Added "${t.name}" to the queue`);
  };

  return (
    <ol className={`tracks${showAlbum ? "" : " no-album"}`}>
      {tracks.map((t, i) => {
        const playing = t.id === current;
        return (
          <li
            key={t.id + i}
            className={playing ? "track playing" : "track"}
            onDoubleClick={() => (dbl === "queue" ? queue(t) : onPlay(i))}
            onKeyDown={(e) => e.key === "Enter" && onPlay(i)}
            tabIndex={0}
          >
            <span className="track-num">
              {playing && !paused ? <Equalizer /> : <span className="n">{i + 1}</span>}
              <button className="track-play" onClick={() => (playing ? controls.toggle() : onPlay(i))} aria-label={`Play ${t.name}`}>
                <Icon name={playing && !paused ? "pause" : "play"} size={16} />
              </button>
            </span>
            <span className="track-main">
              {showCover && <img className="track-cover" src={pickImage(t.album.images, 64)} alt="" loading="lazy" />}
              <span className="track-text">
                <span className="track-name">
                  {t.name}
                  {t.explicit && <span className="explicit" title="Explicit">E</span>}
                </span>
                <span className="track-artists">
                  <Artists artists={t.artists} />
                </span>
              </span>
            </span>
            {showAlbum && (
              <a className="track-album" href={href.album(t.album.id)}>
                {t.album.name}
              </a>
            )}
            <span className="track-end">
              <button className="icon-btn track-queue" onClick={() => queue(t)} aria-label={`Add ${t.name} to queue`} title="Add to queue">
                <Icon name="queue" size={16} />
              </button>
              <span className="track-time">{formatTime(t.duration_ms)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function TrackListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ol className="tracks" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li className="track" key={i}>
          <span className="track-num" />
          <span className="track-main">
            <span className="track-cover skeleton" />
            <span className="track-text">
              <span className="skeleton line" />
              <span className="skeleton line short" />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
