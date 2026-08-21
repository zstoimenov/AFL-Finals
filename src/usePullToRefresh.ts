import { useEffect, useRef, useState } from 'react';

/** How far the finger must travel before letting go counts as a refresh. */
const THRESHOLD = 35;
/** Past this, the indicator stops following the finger — it isn't a drawer. */
const MAX_PULL = 110;
/** The drag is damped, so the indicator moves about half as far as the finger. */
const RESISTANCE = 0.5;

/**
 * Pull down at the top of the page to refresh.
 *
 * The refresh already existed as a small pill in the header carrying the
 * timestamp, which is a fine place for "when is this from" and a poor one for
 * "get me the latest" — on a phone the gesture is what people reach for, and
 * they reach for it without being told. The header control stays; this is the
 * same action under the thumb.
 *
 * Only starts when the page is already scrolled to the top, so it never fights
 * a normal scroll, and it abandons the gesture the moment the finger moves more
 * sideways than down — a swipe belongs to whatever is under it.
 *
 * The live pull distance is kept in a ref as well as in state: state is what the
 * indicator renders from, but the listeners must not be re-bound on every touch
 * move, so the handlers read the ref.
 */
export function usePullToRefresh(onRefresh: () => void | Promise<void>, enabled = true) {
  const [pull, setPull] = useState(0);
  const pullNow = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  // the callback changes identity every render; the listeners must not
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    const setPullTo = (next: number) => {
      pullNow.current = next;
      setPull(next);
    };

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      dragging.current = false;
    };

    const onMove = (e: TouchEvent) => {
      const from = start.current;
      if (!from || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dy = t.clientY - from.y;
      const dx = t.clientX - from.x;
      if (!dragging.current && (dy <= 0 || Math.abs(dx) > Math.abs(dy))) {
        start.current = null;
        return;
      }
      dragging.current = true;
      setPullTo(Math.min(MAX_PULL, dy * RESISTANCE));
    };

    const onEnd = () => {
      if (dragging.current && pullNow.current >= THRESHOLD) void refresh.current();
      start.current = null;
      dragging.current = false;
      setPullTo(0);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  return {
    /** how far the indicator has been dragged, in pixels */
    pull,
    /** letting go now would refresh */
    armed: pull >= THRESHOLD
  };
}
