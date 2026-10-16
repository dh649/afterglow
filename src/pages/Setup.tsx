import { useState } from "react";
import { auth, login, redirectUri, setClientId } from "../lib/auth";
import { useStore } from "../lib/store";

/** First-run screen: paste the Spotify Client ID, then log in. */
export function Setup() {
  const { clientId, error } = useStore(auth, (a) => a);
  const [draft, setDraft] = useState(clientId);
  const [copied, setCopied] = useState(false);
  const valid = /^[0-9a-f]{32}$/i.test(draft.trim());

  const copy = async () => {
    await navigator.clipboard.writeText(redirectUri()).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="setup">
      <div className="setup-glow" aria-hidden="true" />
      <div className="setup-card glass">
        <span className="brand-mark big" aria-hidden="true" />
        <h1>Afterglow</h1>
        <p className="setup-lede">Your Spotify, your way. Connect it once and your music, playlists and history show up here.</p>

        {clientId ? (
          <>
            <button className="play-wide" onClick={login}>
              Log in with Spotify
            </button>
            <button className="text-btn" onClick={() => setClientId("")}>
              Use a different Client ID
            </button>
          </>
        ) : (
          <form
            className="setup-steps"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) setClientId(draft);
            }}
          >
            <ol>
              <li>
                Open the{" "}
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  Spotify developer dashboard
                </a>{" "}
                and create an app. Any name works.
              </li>
              <li>
                Under Redirect URIs, add this address exactly:
                <span className="copy-row">
                  <code>{redirectUri()}</code>
                  <button type="button" className="pill-btn" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </span>
              </li>
              <li>Tick Web API and Web Playback SDK, then save.</li>
              <li>Copy the app's Client ID and paste it here.</li>
            </ol>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Client ID" spellCheck={false} aria-label="Spotify Client ID" />
            <button className="play-wide" type="submit" disabled={!valid}>
              Continue
            </button>
            {draft && !valid && <p className="hint">A Client ID is 32 letters and numbers.</p>}
          </form>
        )}

        {error && <p className="setup-error">{error}</p>}
        <p className="hint">
          Needs Spotify Premium and Chrome or Edge. Want a look first? <a href="?demo">Try the demo</a>.
        </p>
      </div>
    </main>
  );
}
