import { useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/** A titled, horizontally scrolling row (home page sections, artist releases). */
export function Shelf({ title, note, children, wide }: { title: string; note?: ReactNode; children: ReactNode; wide?: boolean }) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>{title}</h2>
        {note && <span className="shelf-note">{note}</span>}
        <div className="shelf-arrows">
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}>
            <Icon name="back" size={18} />
          </button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}>
            <Icon name="forward" size={18} />
          </button>
        </div>
      </header>
      <div className={wide ? "shelf-row wide" : "shelf-row"} ref={row}>
        {children}
      </div>
    </section>
  );
}

export function ShelfSkeleton({ title }: { title: string }) {
  return (
    <Shelf title={title}>
      {Array.from({ length: 6 }, (_, i) => (
        <div className="tile" key={i} aria-hidden="true">
          <div className="cover skeleton" />
          <div className="skeleton line" />
          <div className="skeleton line short" />
        </div>
      ))}
    </Shelf>
  );
}
