import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  itemSelector?: string;
};

/**
 * Horizontal, snap-scrolling carousel with:
 *  - Native touch swipe (overflow-x-auto + snap)
 *  - Mouse pointer drag-to-scroll (desktop)
 *  - Keyboard nav: ← → Home End PageUp PageDown
 */
export function HorizontalCarousel({
  children,
  ariaLabel,
  className,
  itemSelector = "[data-carousel-item]",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ down: boolean; moved: boolean; startX: number; startScroll: number; pointerId: number | null }>({
    down: false,
    moved: false,
    startX: 0,
    startScroll: 0,
    pointerId: null,
  });

  const getItems = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>(itemSelector) ?? []);

  const scrollByItems = useCallback((dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const items = getItems();
    if (!items.length) return;
    const step = items[0].getBoundingClientRect().width + 20; // gap-5 ≈ 20px
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, [itemSelector]);

  const focusItem = (index: number) => {
    const items = getItems();
    if (!items.length) return;
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    items[clamped].focus();
    items[clamped].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = getItems();
    if (!items.length) return;
    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? items.indexOf(active) : -1;

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        if (currentIndex >= 0) focusItem(currentIndex + 1);
        else scrollByItems(1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (currentIndex >= 0) focusItem(currentIndex - 1);
        else scrollByItems(-1);
        break;
      case "Home":
        e.preventDefault();
        focusItem(0);
        break;
      case "End":
        e.preventDefault();
        focusItem(items.length - 1);
        break;
      case "PageDown":
        e.preventDefault();
        scrollByItems(1);
        break;
      case "PageUp":
        e.preventDefault();
        scrollByItems(-1);
        break;
    }
  };

  // Mouse drag-to-scroll (skip touch — native scroll is better)
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    drag.current = {
      down: true,
      moved: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d.down || !el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) {
      if (!d.moved) {
        d.moved = true;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      }
      el.scrollLeft = d.startScroll - dx;
    }
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.moved) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    }
    drag.current = { down: false, moved: false, startX: 0, startScroll: 0, pointerId: null };
  };

  // Prevent click after a drag
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  useEffect(() => {
    // clear on unmount
    return () => {
      drag.current = { down: false, moved: false, startX: 0, startScroll: 0, pointerId: null };
    };
  }, []);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      className={
        (className ?? "") +
        " flex snap-x snap-mandatory overflow-x-auto scroll-smooth outline-none select-none focus-visible:ring-1 focus-visible:ring-white/20 rounded-md"
      }
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
    >
      {children}
    </div>
  );
}
