import { useCallback, useState, type ReactNode } from 'react';
import { useDialog } from '../useDialog';

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
  const close = useCallback(() => setOpen(false), []);

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
        <InfoModal title={title} onClose={close}>
          {children}
        </InfoModal>
      )}
    </>
  );
}

/**
 * The popup itself, split out so the dialog hook mounts and unmounts with it —
 * focus is taken on open and handed back on close, which only works if the
 * component's life matches the dialog's.
 */
function InfoModal({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const modal = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="info-backdrop" onClick={onClose}>
      <div
        className="info-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={modal}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="info-modal-head">
          <h3>{title}</h3>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="info-modal-body">{children}</div>
      </div>
    </div>
  );
}
