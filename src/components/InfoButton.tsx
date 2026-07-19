import { useEffect, useState, type ReactNode } from 'react';

/**
 * A small ⓘ button that opens a popup with explanatory text, keeping the main
 * screen to just titles and content. Esc or backdrop click closes it.
 */
export default function InfoButton({
  title,
  children,
  label
}: {
  title: string;
  children: ReactNode;
  /** optional visible text after the icon, e.g. "About" */
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={label ? 'infobtn labelled' : 'infobtn'}
        aria-label={title}
        title={title}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true" className="infoicon">
          i
        </span>
        {label && <span className="infolabel">{label}</span>}
      </button>
      {open && (
        <div className="info-backdrop" onClick={() => setOpen(false)}>
          <div
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="info-modal-head">
              <h3>{title}</h3>
              <button
                type="button"
                className="sheet-close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </header>
            <div className="info-modal-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
