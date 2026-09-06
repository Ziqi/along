export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
    >
      <path d="M4 19 L12 5 L20 19" />
      <path d="M8 13h8" />
    </svg>
  );
}