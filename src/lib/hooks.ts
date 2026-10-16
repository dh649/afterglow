import { useEffect, useState, useSyncExternalStore } from "react";

/* ---------- Hash routing (works on GitHub Pages without server setup) ---------- */

export type Route =
  | { page: "home" }
  | { page: "search"; q: string }
  | { page: "liked" }
  | { page: "playlist"; id: string }
  | { page: "album"; id: string }
  | { page: "artist"; id: string }
  | { page: "settings" };

function parse(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const [page, id] = path.split("/");
  switch (page) {
    case "search":
      return { page: "search", q: new URLSearchParams(query).get("q") ?? "" };
    case "liked":
      return { page: "liked" };
    case "settings":
      return { page: "settings" };
    case "playlist":
    case "album":
    case "artist":
      if (id) return { page, id };
  }
  return { page: "home" };
}

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash);
  return parse(hash);
}

export const href = {
  home: () => "#/",
  liked: () => "#/liked",
  settings: () => "#/settings",
  search: (q = "") => (q ? `#/search?q=${encodeURIComponent(q)}` : "#/search"),
  playlist: (id: string) => `#/playlist/${id}`,
  album: (id: string) => `#/album/${id}`,
  artist: (id: string) => `#/artist/${id}`,
};

/* ---------- Data loading with a small in-memory cache ---------- */

const cache = new Map<string, { at: number; data: unknown }>();
const FRESH_MS = 2 * 60 * 1000;

export function useAsync<T>(key: string | null, fn: () => Promise<T>) {
  const hit = key ? cache.get(key) : undefined;
  const [state, setState] = useState<{ key: string | null; data?: T; error?: Error; loading: boolean }>(() => ({
    key,
    data: hit?.data as T | undefined,
    loading: !!key && !hit,
  }));

  useEffect(() => {
    if (!key) return;
    let live = true;
    const cached = cache.get(key);
    setState({ key, data: cached?.data as T | undefined, loading: !cached });
    if (cached && Date.now() - cached.at < FRESH_MS) return;
    fn().then(
      (data) => {
        cache.set(key, { at: Date.now(), data });
        if (live) setState({ key, data, loading: false });
      },
      (error: Error) => live && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => {
      live = false;
    };
    // fn is recreated each render; the key decides when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Avoid flashing the previous page's data while a new key loads.
  if (state.key !== key) return { data: undefined as T | undefined, error: undefined, loading: true };
  return state;
}

export function invalidate(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

/* ---------- Misc ---------- */

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Re-renders on every animation frame while `active` is true. Pass `everyMs` to
 * use a timer instead, which keeps ticking when the main window is minimized
 * (needed by the floating mini player).
 */
export function useFrame(active: boolean, everyMs?: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (everyMs) {
      const t = setInterval(() => tick((n) => n + 1), everyMs);
      return () => clearInterval(t);
    }
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, everyMs]);
}

export function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
