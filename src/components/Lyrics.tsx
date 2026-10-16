import { useEffect, useMemo, useRef, useState } from "react";
import { forgetLyrics, getLyrics, type LyricLine, type Lyrics as LyricsData } from "../lib/lyrics";
import { controls, currentPosition, player, type NowPlaying } from "../lib/player";
import { settings } from "../lib/settings";
import { useStore } from "../lib/store";
import { useFrame } from "../lib/hooks";

/**
 * Word timing: uses real per-word times when the lyrics include them, otherwise
 * spreads the line's time across its words by length, which reads naturally.
 */
function wordsOf(line: LyricLine) {
  if (line.words?.length) return line.words.map((w, i) => ({ text: w.text, start: w.time, end: line.words![i + 1]?.time ?? line.end }));
  const parts = line.text.split(" ");
  const sungFor = Math.min(line.end - line.time, 600 + line.text.length * 85);
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  let t = line.time;
  return parts.map((text) => {
    const d = ((text.length + 1) / total) * sungFor;
    const w = { text, start: t, end: t + d };
    t += d;
    return w;
  });
}

function Line({ line, state, pos, onSeek }: { line: LyricLine; state: "past" | "now" | "next"; pos: number; onSeek: () => void }) {
  const words = useMemo(() => wordsOf(line), [line]);
  if (!line.text) {
    // An instrumental gap: three dots that fill in as it passes.
    const pct = state === "now" ? (pos - line.time) / (line.end - line.time) : state === "past" ? 1 : 0;
    if (line.end - line.time < 3500) return null;
    return (
      <div className={`lyric gap ${state}`} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} style={{ opacity: 0.25 + Math.min(1, Math.max(0, pct * 3 - i)) * 0.75 }} />
        ))}
      </div>
    );
  }
  return (
    <button className={`lyric ${state}`} onClick={onSeek}>
      {words.map((w, i) => {
        const p = state === "past" ? 1 : state === "next" ? 0 : Math.min(1, Math.max(0, (pos - w.start) / (w.end - w.start)));
        return (
          <span key={i} className="w" style={{ "--p": `${(p * 100).toFixed(1)}%` } as React.CSSProperties}>
            {w.text}{" "}
          </span>
        );
      })}
    </button>
  );
}

function Synced({ lines }: { lines: LyricLine[] }) {
  const paused = useStore(player, (s) => s.paused);
  const offset = useStore(settings, (s) => s.lyricsOffsetMs);
  useFrame(!paused);
  const pos = currentPosition() + offset;
  const box = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);

  let active = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].time <= pos) active = i;

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${Math.max(active, 0)}"]`);
    if (!el || !box.current || Date.now() - userScrolledAt.current < 4000) return;
    const target = el.offsetTop - box.current.clientHeight * 0.38;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.current.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
  }, [active]);

  const markScroll = () => (userScrolledAt.current = Date.now());

  return (
    <div className="lyrics-scroll" ref={box} onWheel={markScroll} onTouchMove={markScroll}>
      <div className="lyrics-pad" />
      {lines.map((l, i) => (
        <div data-i={i} key={i} className="lyric-wrap" style={{ "--d": Math.min(Math.abs(i - active), 6) } as React.CSSProperties}>
          <Line
            line={l}
            state={i < active ? "past" : i === active ? "now" : "next"}
            pos={pos}
            onSeek={() => {
              userScrolledAt.current = 0;
              controls.seek(Math.max(0, l.time - offset));
            }}
          />
        </div>
      ))}
      <div className="lyrics-pad" />
    </div>
  );
}

export function Lyrics({ track }: { track: NowPlaying }) {
  const [data, setData] = useState<LyricsData | null>(null);
  const [attempt, setAttempt] = useState(0);
  const size = useStore(settings, (s) => s.lyricsSize);
  const offset = useStore(settings, (s) => s.lyricsOffsetMs);

  useEffect(() => {
    let live = true;
    setData(null);
    getLyrics(track).then((d) => live && setData(d));
    return () => {
      live = false;
    };
    // The track object is rebuilt on every player update; only a new song matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, attempt]);

  const nudge = (ms: number) => settings.set({ lyricsOffsetMs: Math.max(-5000, Math.min(5000, offset + ms)) });

  return (
    <div className={`lyrics size-${size}`}>
      {!data && <p className="lyrics-msg">Finding lyrics…</p>}
      {data?.kind === "synced" && <Synced lines={data.lines} />}
      {data?.kind === "plain" && (
        <div className="lyrics-scroll plain">
          <p className="lyrics-note">These lyrics aren't timed to the song.</p>
          {data.text.split("\n").map((l, i) => (
            <p key={i} className="lyric plain-line">
              {l || " "}
            </p>
          ))}
        </div>
      )}
      {data?.kind === "instrumental" && <p className="lyrics-msg">This one's instrumental.</p>}
      {data?.kind === "none" && <p className="lyrics-msg">No lyrics found for this song.</p>}
      {data?.kind === "offline" && (
        <div className="lyrics-msg">
          <div className="lyrics-offline">
            <p>Couldn't reach the lyrics service.</p>
            <button
              className="pill-btn"
              onClick={() => {
                forgetLyrics(track.id);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {data?.kind === "synced" && (
        <div className="lyrics-offset" title="Lyrics timing">
          <button className="icon-btn" onClick={() => nudge(-250)} aria-label="Show lyrics earlier">
            −
          </button>
          <span>{offset === 0 ? "In sync" : `${offset > 0 ? "+" : ""}${(offset / 1000).toFixed(2)}s`}</span>
          <button className="icon-btn" onClick={() => nudge(250)} aria-label="Show lyrics later">
            +
          </button>
        </div>
      )}
    </div>
  );
}
