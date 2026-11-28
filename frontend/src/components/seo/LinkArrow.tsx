// Small "opens more detail" arrow shown in the corner of clickable stat tiles.
export default function LinkArrow({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M4 2h6v6M10 2L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}
