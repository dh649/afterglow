import { createRoot } from "react-dom/client";
import { App } from "./App";
import { handleRedirect } from "./lib/auth";
import { initMediaSession } from "./lib/mediaSession";
import { AppError, ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Finish a Spotify login first (if we just came back from it), then show the app.
handleRedirect().finally(() => {
  initMediaSession();
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary fallback={(error) => <AppError error={error} />}>
      <App />
    </ErrorBoundary>,
  );
});
