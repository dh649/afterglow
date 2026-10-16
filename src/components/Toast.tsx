import { useEffect } from "react";
import { createStore, useStore } from "../lib/store";
import { controls, player } from "../lib/player";

const toasts = createStore({ text: "", n: 0 });

export function toast(text: string) {
  toasts.set((s) => ({ text, n: s.n + 1 }));
}

/** Short confirmations, plus player errors that need the person's attention. */
export function Toasts() {
  const { text, n } = useStore(toasts, (s) => s);
  const error = useStore(player, (s) => s.error);

  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => toasts.set({ text: "" }), 2600);
    return () => clearTimeout(t);
  }, [text, n]);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {error && (
        <div className="toast error">
          <span>{error}</span>
          <button onClick={controls.clearError}>Dismiss</button>
        </div>
      )}
      {text && <div className="toast" key={n}>{text}</div>}
    </div>
  );
}
