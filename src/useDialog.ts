import { useCallback, useEffect, useRef } from 'react';

/**
 * The behaviour every dialog in the app owes a keyboard.
 *
 * The sheets and popups already announced themselves as `aria-modal` dialogs and
 * closed on Escape, but focus stayed on the page behind them: tabbing walked the
 * ladder underneath a sheet that was covering it, and closing left focus nowhere.
 * A modal has to take focus, keep it, and give it back.
 *
 * Doing it once here rather than in each dialog is the same reasoning as
 * `inkOn` in `teams.ts` — four copies of this is four chances to get it wrong,
 * and the one that's wrong is the one nobody tests with a keyboard.
 *
 * Returns a ref to put on the dialog element; it also handles Escape and locks
 * the background from scrolling while the dialog is up.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  // whatever had focus when we opened, so it can have it back
  const opener = useRef<Element | null>(null);

  const focusables = useCallback((): HTMLElement[] => {
    const el = ref.current;
    if (!el) return [];
    return [
      ...el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ].filter((n) => n.offsetParent !== null || n === document.activeElement);
  }, []);

  useEffect(() => {
    opener.current = document.activeElement;
    const el = ref.current;
    // focus the dialog itself rather than its first control: a screen reader
    // then reads the dialog's label before anything inside it
    if (el) {
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // wrap at both ends so Tab can never walk out into the page behind
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // hand focus back to whatever opened us, if it's still on the page
      const back = opener.current;
      if (back instanceof HTMLElement && document.contains(back)) {
        back.focus({ preventScroll: true });
      }
    };
  }, [onClose, focusables]);

  return ref;
}
