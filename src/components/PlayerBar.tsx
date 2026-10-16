import { useRef, useState } from "react";
import { controls, currentPosition, player } from "../lib/player";
import { useStore } from "../lib/store";
import { formatTime, href, useFrame } from "../lib/hooks";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { Artists } from "./TrackList";
import { MiniPlayerButton } from "./MiniPlayer";

/** Seek bar. Re-renders every frame only while music is playing. */
export function Timeline({ compact }: { compact?: boolean }) {
  const duration = useStore(player, (s) => s.track?.durationMs ?? 0);
  const paused = useStore(player, (s) => s.paused);
  const [drag, setDrag] = useState<number | null>(null);
  useFrame(!paused && drag === null, compact ? 500 : undefined);
  const pos = drag ?? currentPosition();
  const pct = duration ? (pos / duration) * 100 : 0;

  return (
    <div className={`timeline${compact ? " compact" : ""}`}>
      {!compact && <span className="time">{formatTime(pos)}</span>}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={500}
        value={pos}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag !== null) controls.seek(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null) controls.seek(drag);
          setDrag(null);
        }}
        aria-label="Seek"
        aria-valuetext={`${formatTime(pos)} of ${formatTime(duration)}`}
        disabled={!duration}
      />
      {!compact && <span className="time">{formatTime(duration)}</span>}
    </div>
  );
}

export function Transport({ size = "normal" }: { size?: "normal" | "big" }) {
  const paused = useStore(player, (s) => s.paused);
  const shuffle = useStore(player, (s) => s.shuffle);
  const repeat = useStore(player, (s) => s.repeat);
  const big = size === "big";
  return (
    <div className={`transport${big ? " big" : ""}`}>
      <button className={`icon-btn${shuffle ? " on" : ""}`} onClick={controls.shuffle} aria-pressed={shuffle} aria-label="Shuffle" title="Shuffle">
        <Icon name="shuffle" size={big ? 22 : 18} />
      </button>
      <button className="icon-btn" onClick={controls.prev} aria-label="Previous" title="Previous">
        <Icon name="prev" size={big ? 28 : 22} />
      </button>
      <button className="play-btn" onClick={controls.toggle} aria-label={paused ? "Play" : "Pause"}>
        <Icon name={paused ? "play" : "pause"} size={big ? 32 : 22} />
      </button>
      <button className="icon-btn" onClick={controls.next} aria-label="Next" title="Next">
        <Icon name="next" size={big ? 28 : 22} />
      </button>
      <button
        className={`icon-btn repeat${repeat !== "off" ? " on" : ""}`}
        onClick={controls.cycleRepeat}
        aria-label={`Repeat: ${repeat === "track" ? "this song" : repeat === "context" ? "on" : "off"}`}
        title={repeat === "track" ? "Repeating this song" : repeat === "context" ? "Repeat on" : "Repeat off"}
      >
        <Icon name="repeat" size={big ? 22 : 18} />
        {repeat === "track" && <span className="repeat-one">1</span>}
      </button>
    </div>
  );
}

function Volume() {
  const volume = useStore(player, (s) => s.volume);
  const before = useRef(0.7);
  const muted = volume === 0;
  return (
    <div className="volume">
      <button
        className="icon-btn"
        onClick={() => {
          if (muted) controls.setVolume(before.current || 0.5);
          else {
            before.current = volume;
            controls.setVolume(0);
          }
        }}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        <Icon name={muted ? "mute" : "volume"} size={18} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        style={{ "--pct": `${volume * 100}%` } as React.CSSProperties}
        onChange={(e) => controls.setVolume(Number(e.target.value))}
        aria-label="Volume"
      />
    </div>
  );
}

export function PlayerBar({ onOpen, open }: { onOpen: () => void; open: boolean }) {
  const track = useStore(player, (s) => s.track);
  const status = useStore(player, (s) => s.status);

  return (
    <footer className="player-bar glass">
      <div className="pb-left">
        {track ? (
          <>
            <button className="pb-cover" onClick={onOpen} aria-label="Open now playing">
              {track.album.imageSmall && <img src={track.album.imageSmall} alt="" />}
            </button>
            <div className="pb-text">
              <button className="pb-title" onClick={onOpen}>
                {track.name}
              </button>
              <span className="pb-artists">
                <Artists artists={track.artists} />
              </span>
            </div>
            <LikeButton uri={track.uri} label="song" size={18} />
          </>
        ) : (
          <span className="pb-empty">{status === "ready" ? "Pick something to play" : "Connecting to Spotify…"}</span>
        )}
      </div>

      <div className="pb-center">
        <Transport />
        <Timeline />
      </div>

      <div className="pb-right">
        <button className={`icon-btn${open ? " on" : ""}`} onClick={onOpen} aria-label="Lyrics and now playing" title="Lyrics (L)">
          <Icon name="lyrics" size={18} />
        </button>
        <MiniPlayerButton />
        <Volume />
        {track && (
          <a className="sr-only" href={href.album(track.album.id)}>
            Go to album
          </a>
        )}
      </div>
    </footer>
  );
}
