import { useRef, useState, type ReactNode } from "react";
import { defaults, downscaleImage, settings, type Settings } from "../lib/settings";
import { useStore } from "../lib/store";
import { auth, isDemo, logout } from "../lib/auth";
import { useAsync } from "../lib/hooks";
import { spotify } from "../lib/spotify";
import { invalidate } from "../lib/hooks";

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, format, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; label: string }) {
  return (
    <div className="slider-wrap">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--pct": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <output>{format(value)}</output>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className={`toggle${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function SettingsPage() {
  const s = useStore(settings, (x) => x);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => settings.set({ [k]: v } as Partial<Settings>);
  const file = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const [key, setKey] = useState(s.lastfmKey);
  const [relay, setRelay] = useState(s.lyricsRelay);
  const me = useAsync("me", spotify.me).data;
  const clientId = useStore(auth, (a) => a.clientId);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setFileError("");
    try {
      settings.set({ wallpaper: await downscaleImage(f), background: "wallpaper" });
    } catch (e) {
      setFileError((e as Error).message);
    }
  };

  return (
    <div className="page settings">
      <h1>Settings</h1>

      <section>
        <h2>Background</h2>
        <Row label="Show behind everything">
          <Segmented
            label="Background"
            value={s.background}
            onChange={(v) => set("background", v)}
            options={[["album", "Album art"], ["wallpaper", "Your image"], ["plain", "Plain"]]}
          />
        </Row>
        <Row label="Your image" hint={fileError || "JPG, PNG or WebP. It's stored only in this browser."}>
          <div className="wallpaper-pick">
            {s.wallpaper && <img src={s.wallpaper} alt="Current background" />}
            <button className="pill-btn" onClick={() => file.current?.click()}>
              {s.wallpaper ? "Change image" : "Upload image"}
            </button>
            {s.wallpaper && (
              <button className="pill-btn ghost" onClick={() => settings.set({ wallpaper: null, background: s.background === "wallpaper" ? "album" : s.background })}>
                Remove
              </button>
            )}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </div>
        </Row>
        <Row label="Blur">
          <Slider label="Background blur" value={s.blur} min={0} max={80} step={2} onChange={(v) => set("blur", v)} format={(v) => `${v}px`} />
        </Row>
        <Row label="Dim" hint="Darkens the background so text stays readable">
          <Slider label="Background dim" value={s.dim} min={0} max={0.9} step={0.05} onChange={(v) => set("dim", v)} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label="Slow motion" hint="Lets the album art drift and swirl. Turns off automatically if your system asks for reduced motion.">
          <Toggle label="Animate background" on={s.motion} onChange={(v) => set("motion", v)} />
        </Row>
      </section>

      <section>
        <h2>Panels</h2>
        <Row label="Glass tint" hint="How solid the sidebar and player look">
          <Slider label="Panel opacity" value={s.glass} min={0} max={0.8} step={0.02} onChange={(v) => set("glass", v)} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label="Color from album" hint="Tints buttons and highlights with the current cover">
          <Toggle label="Album accent color" on={s.albumAccent} onChange={(v) => set("albumAccent", v)} />
        </Row>
      </section>

      <section>
        <h2>Lyrics</h2>
        <Row label="Text size">
          <Segmented label="Lyrics size" value={s.lyricsSize} onChange={(v) => set("lyricsSize", v)} options={[["small", "Small"], ["medium", "Medium"], ["large", "Large"]]} />
        </Row>
        <Row label="Timing" hint="If lyrics run late, move this left. You can also adjust it while lyrics are open.">
          <Slider
            label="Lyrics offset"
            value={s.lyricsOffsetMs}
            min={-2000}
            max={2000}
            step={100}
            onChange={(v) => set("lyricsOffsetMs", v)}
            format={(v) => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(1)}s`}
          />
        </Row>
      </section>

      <section>
        <h2>Lyrics relay</h2>
        <Row
          label="Your own relay (optional)"
          hint="Lyrics already work without this. If they start failing often, set up your own free relay (steps in the README) and paste its address here."
        >
          <form
            className="key-form"
            onSubmit={(e) => {
              e.preventDefault();
              set("lyricsRelay", relay.trim());
            }}
          >
            <input value={relay} onChange={(e) => setRelay(e.target.value)} placeholder="https://….workers.dev" spellCheck={false} aria-label="Lyrics relay address" />
            <button className="pill-btn" type="submit" disabled={relay.trim() === s.lyricsRelay}>
              Save
            </button>
          </form>
        </Row>
      </section>

      <section>
        <h2>Playback</h2>
        <Row label="Double-click a song">
          <Segmented label="Double-click action" value={s.doubleClick} onChange={(v) => set("doubleClick", v)} options={[["play", "Play it"], ["queue", "Add to queue"]]} />
        </Row>
      </section>

      <section>
        <h2>Suggestions</h2>
        <Row
          label="Last.fm API key"
          hint={
            <>
              Powers the For you row. Get one free at{" "}
              <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
                last.fm/api
              </a>{" "}
              (any app name works; leave the callback blank).
            </>
          }
        >
          <form
            className="key-form"
            onSubmit={(e) => {
              e.preventDefault();
              invalidate("foryou");
              localStorage.removeItem("afterglow.foryou");
              set("lastfmKey", key.trim());
            }}
          >
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your key" spellCheck={false} aria-label="Last.fm API key" />
            <button className="pill-btn" type="submit" disabled={key.trim() === s.lastfmKey}>
              Save key
            </button>
          </form>
        </Row>
      </section>

      <section>
        <h2>Account</h2>
        <Row label={me ? `Logged in as ${me.display_name}` : "Spotify account"} hint={isDemo ? "This is demo mode with made-up music." : `Spotify app Client ID ends in …${clientId.slice(-6)}`}>
          {!isDemo && (
            <button className="pill-btn ghost" onClick={logout}>
              Log out
            </button>
          )}
        </Row>
      </section>

      <button className="pill-btn ghost reset" onClick={() => settings.set({ ...defaults, lastfmKey: s.lastfmKey, lyricsRelay: s.lyricsRelay })}>
        Reset look and lyrics settings
      </button>
    </div>
  );
}
