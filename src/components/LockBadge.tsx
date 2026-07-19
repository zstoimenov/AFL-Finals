export default function LockBadge({ label }: { label: string }) {
  const eliminated = label === 'Eliminated';
  return (
    <span className={eliminated ? 'lockbadge out' : 'lockbadge'} title="Mathematically settled">
      <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" fill="currentColor">
        <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
      </svg>
      {label}
    </span>
  );
}
