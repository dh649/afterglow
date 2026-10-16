import { createRoot } from "react-dom/client";
import { App } from "./App";
import { handleRedirect } from "./lib/auth";
import "./styles.css";

// Finish a Spotify login first (if we just came back from it), then show the app.
handleRedirect().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
