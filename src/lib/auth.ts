import { createStore } from "./store";

/**
 * Spotify login using the Authorization Code + PKCE flow.
 * No server or client secret needed: only your app's Client ID.
 */

const CLIENT_KEY = "afterglow.clientId";
const TOKEN_KEY = "afterglow.token";
const VERIFIER_KEY = "afterglow.verifier";

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-recently-played",
  "user-top-read",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

interface Token {
  access: string;
  refresh: string;
  expiresAt: number;
}

export const isDemo = new URLSearchParams(location.search).has("demo");

export const auth = createStore({
  clientId: localStorage.getItem(CLIENT_KEY) ?? "",
  loggedIn: isDemo || !!localStorage.getItem(TOKEN_KEY),
  error: "",
});

/** The exact address Spotify sends people back to. Must match the dashboard setting. */
export function redirectUri() {
  return location.origin + location.pathname;
}

export function setClientId(id: string) {
  localStorage.setItem(CLIENT_KEY, id.trim());
  auth.set({ clientId: id.trim() });
}

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function login() {
  const { clientId } = auth.get();
  if (!clientId) return;
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  auth.set({ loggedIn: false });
}

function saveToken(json: { access_token: string; refresh_token?: string; expires_in: number }, prevRefresh = "") {
  const t: Token = {
    access: json.access_token,
    refresh: json.refresh_token ?? prevRefresh,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  return t;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "Spotify login failed");
  return json;
}

/** Finishes login when Spotify redirects back with ?code=. Call once at startup. */
export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const err = params.get("error");
  if (!code && !err) return;
  history.replaceState(null, "", redirectUri() + location.hash);
  if (err) {
    auth.set({ error: err === "access_denied" ? "Login was cancelled." : `Spotify said: ${err}` });
    return;
  }
  try {
    const json = await tokenRequest({
      grant_type: "authorization_code",
      code: code!,
      redirect_uri: redirectUri(),
      client_id: auth.get().clientId,
      code_verifier: sessionStorage.getItem(VERIFIER_KEY) ?? "",
    });
    saveToken(json);
    auth.set({ loggedIn: true, error: "" });
  } catch (e) {
    auth.set({ error: (e as Error).message });
  }
}

let refreshing: Promise<Token> | null = null;

/** Returns a valid access token, refreshing it when it's about to expire. */
export async function getAccessToken(force = false): Promise<string> {
  if (isDemo) return "demo";
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) throw new Error("Not logged in");
  const t = JSON.parse(raw) as Token;
  if (!force && Date.now() < t.expiresAt) return t.access;
  refreshing ??= tokenRequest({
    grant_type: "refresh_token",
    refresh_token: t.refresh,
    client_id: auth.get().clientId,
  })
    .then((json) => saveToken(json, t.refresh))
    .catch((e) => {
      logout();
      auth.set({ error: "Your Spotify session ended. Log in again." });
      throw e;
    })
    .finally(() => (refreshing = null));
  return (await refreshing).access;
}
