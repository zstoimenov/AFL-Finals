import { useEffect, useState, type ReactNode } from 'react';
import type { Tab } from '../nav';

/**
 * The app's navigation, in the shape each screen size wants.
 *
 * On a phone it's a bottom bar — inside the thumb's reach, out of the way of the
 * content, and the pattern an installed PWA is expected to have. On a wider
 * screen it stays the pill row, which reads better with a mouse and has the room
 * to show every destination at once.
 *
 * Both are rendered and CSS picks one, so there's no resize listener, no
 * breakpoint guessing and no flash of the wrong nav on first paint.
 *
 * The bar holds four destinations plus **More**; anything past that goes in the
 * More sheet — two taps, but only for the screens you visit least. When the
 * screen you're on lives in the sheet, More takes its name and its highlight, so
 * you're never left wondering where you are.
 */

export interface NavItem {
  key: Tab;
  label: string;
}

/** Destinations on the bar itself; the rest go under More. */
const PRIMARY_SLOTS = 4;

export default function PrimaryNav({
  items,
  active,
  onSelect,
  stuck,
  extra = []
}: {
  items: NavItem[];
  active: Tab;
  onSelect: (tab: Tab) => void;
  /** the pill row has scrolled to the top edge and wants its shadow */
  stuck: boolean;
  /** actions that belong in the More sheet but aren't screens of their own */
  extra?: Array<{ label: string; onSelect: () => void }>;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  // never leave the sheet hanging over a screen you've already moved to
  useEffect(() => setMoreOpen(false), [active]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const needsMore = items.length > PRIMARY_SLOTS || extra.length > 0;
  const primary = needsMore ? items.slice(0, PRIMARY_SLOTS) : items;
  const overflow = needsMore ? items.slice(PRIMARY_SLOTS) : [];
  const activeInOverflow = overflow.find((i) => i.key === active);

  return (
    <>
      {/* wide screens: every destination, as pills */}
      <nav className={stuck ? 'tabs stuck' : 'tabs'} aria-label="Screens">
        {items.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-current={active === key ? 'page' : undefined}
            className={active === key ? 'tab active' : 'tab'}
            onClick={() => onSelect(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* phones: a bottom bar within thumb reach */}
      <nav className="tabbar" aria-label="Screens">
        {primary.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-current={active === key ? 'page' : undefined}
            className={active === key ? 'tabbar-item active' : 'tabbar-item'}
            onClick={() => onSelect(key)}
          >
            <Icon name={key} />
            <span className="tabbar-label">{label}</span>
          </button>
        ))}
        {needsMore && (
          <button
            type="button"
            className={activeInOverflow ? 'tabbar-item active' : 'tabbar-item'}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={activeInOverflow ? 'page' : undefined}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <Icon name={activeInOverflow ? activeInOverflow.key : 'more'} />
            <span className="tabbar-label">{activeInOverflow ? activeInOverflow.label : 'More'}</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <div className="more-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More screens"
            onClick={(e) => e.stopPropagation()}
          >
            {overflow.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={active === key ? 'more-item active' : 'more-item'}
                aria-current={active === key ? 'page' : undefined}
                onClick={() => onSelect(key)}
              >
                <Icon name={key} />
                {label}
              </button>
            ))}
            {extra.map((action) => (
              <button
                key={action.label}
                type="button"
                className="more-item"
                onClick={() => {
                  setMoreOpen(false);
                  action.onSelect();
                }}
              >
                <Icon name="seasons" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Line icons for the bar. Labels always sit beside them — an icon narrows the
 * target down, it never carries the meaning on its own.
 */
function Icon({ name }: { name: Tab | 'more' }) {
  return (
    <svg
      className="navicon"
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}

const GLYPHS: Record<Tab | 'more', ReactNode> = {
  // an eye: what's worth watching
  week: (
    <>
      <path d="M2.6 12S6.2 6.2 12 6.2 21.4 12 21.4 12 17.8 17.8 12 17.8 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </>
  ),
  // a star: your club
  club: <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8L12 3.6Z" />,
  // a calendar: the fixture
  fixtures: (
    <>
      <rect x="3.2" y="5.2" width="17.6" height="15.6" rx="2.6" />
      <path d="M3.2 10h17.6M8 3.2v4M16 3.2v4" />
    </>
  ),
  // a bar chart: the standings
  ladder: <path d="M5 20V11M12 20V4M19 20v-6" />,
  // a knockout tree: two ties joining into one
  bracket: <path d="M3.5 6.5h6M3.5 17.5h6M9.5 6.5v11M9.5 12h11" />,
  // a cup: the premiership
  odds: (
    <>
      <path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4Z" />
      <path d="M7.5 5.5H5a2.4 2.4 0 0 0 2.5 3M16.5 5.5H19a2.4 2.4 0 0 1-2.5 3" />
      <path d="M12 13v3.5M9 20h6" />
    </>
  ),
  // stacked seasons
  seasons: (
    <>
      <path d="M12 3.2 21 7.6 12 12 3 7.6l9-4.4Z" />
      <path d="M3 12.4 12 16.8l9-4.4M3 16.8 12 21.2l9-4.4" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  )
};
