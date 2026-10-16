import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forgetLyrics, getLyrics, type LyricLine, type Lyrics as LyricsData } from "../lib/lyrics";
import { controls, currentPosition, type NowPlaying } from "../lib/player";
import { settings } from "../lib/settings";
import { useStore } from "../lib/store";

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

/**
 * Lines light up slightly before their timestamp. Singers start a word a
 * beat before LRC files usually mark it, so this makes lyrics feel on time.
 */
const LEAD_MS = 150;

type Word = ReturnType<typeof wordsOf>[number];
type State = "past" | "now" | "next";

/**
 * One line of lyrics. Memoized: it only re-renders when it becomes past/now/next.
 * While it's the current line, Synced paints its word fill directly (no re-render).
 */
const Line = memo(function Line({ line, words, state, index, onSeek }: { line: LyricLine; words: Word[]; state: State; index: number; onSeek: (i: number) => void }) {
  if (!line.text) {
    // An instrumental gap: three dots that fill in as it passes.
    if (line.end - line.time < 3500) return null;
    return (
      <div className={`lyric gap ${state}`} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} style={{ opacity: state === "past" ? 1 : 0.25 }} />
        ))}
      </div>
    );
  }
  const fill = state === "past" ? "100%" : "0%";
  return (
    <button className={`lyric ${state}`} onClick={() => onSeek(index)}>
      {words.map((w, i) => (
        <span key={i} className="w" style={{ "--p": fill } as React.CSSProperties}>
          {w.text}{" "}
        </span>
      ))}
    </button>
  );
});

function Synced({ lines }: { lines: LyricLine[] }) {
  const timed = useMemo(() => lines.map(wordsOf), [lines]);
  const [active, setActive] = useState(-1);
  const activeRef = useRef(-1);
  const box = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);

  // One animation loop drives everything. React only re-renders when the
  // current line changes; the word-by-word fill is painted straight onto the
  // page, which keeps it smooth even on slower computers.
  useEffect(() => {
    let raf = 0;
    let lastPaint = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const pos = currentPosition() + settings.get().lyricsOffsetMs + LEAD_MS;
      let a = -1;
      for (let i = 0; i < lines.length && lines[i].time <= pos; i++) a = i;
      if (a !== activeRef.current) {
        activeRef.current = a;
        lastPaint = "";
        setActive(a);
        return;
      }
      if (a < 0) return;
      const el = box.current?.querySelector<HTMLElement>(`[data-i="${a}"]`);
      if (!el) return;
      const line = lines[a];
      if (!line.text) {
        const pct = (pos - line.time) / (line.end - line.time);
        el.querySelectorAll<HTMLElement>(".gap i").forEach((dot, i) => {
          dot.style.opacity = String(0.25 + Math.min(1, Math.max(0, pct * 3 - i)) * 0.75);
        });
        return;
      }
      const fills = timed[a].map((w) => `${(Math.min(1, Math.max(0, (pos - w.start) / (w.end - w.start))) * 100).toFixed(1)}%`);
      const key = fills.join();
      if (key === lastPaint) return; // nothing changed (paused, or between words)
      lastPaint = key;
      el.querySelectorAll<HTMLElement>(".w").forEach((span, i) => span.style.setProperty("--p", fills[i] ?? "100%"));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines, timed]);

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${Math.max(active, 0)}"]`);
    if (!el || !box.current || Date.now() - userScrolledAt.current < 4000) return;
    const target = el.offsetTop - box.current.clientHeight * 0.38;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.current.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
  }, [active]);

  const seek = useCallback(
    (i: number) => {
      userScrolledAt.current = 0;
      controls.seek(Math.max(0, lines[i].time - settings.get().lyricsOffsetMs - LEAD_MS));
    },
    [lines],
  );

  const markScroll = () => (userScrolledAt.current = Date.now());

  return (
    <div className="lyrics-scroll" ref={box} onWheel={markScroll} onTouchMove={markScroll}>
      <div className="lyrics-pad" />
      {lines.map((l, i) => (
        <div data-i={i} key={i} className="lyric-wrap" style={{ "--d": Math.min(Math.abs(i - active), 6) } as React.CSSProperties}>
          <Line line={l} words={timed[i]} index={i} state={i < active ? "past" : i === active ? "now" : "next"} onSeek={seek} />
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
