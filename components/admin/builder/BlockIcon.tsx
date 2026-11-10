// Small stroke icons for the builder palette and block cards. Decorative --
// every place they appear also shows the block's text label.

export type BlockIconName =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "question"
  | "callout"
  | "section"
  | "part"
  | "passage"
  | "station"
  | "practice"
  | "prayer"
  | "line";

const PATHS: Record<BlockIconName, React.ReactNode> = {
  text: <path d="M4 6h16M4 11h16M4 16h10" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
      <circle cx="15.5" cy="9" r="1.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </>
  ),
  audio: <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />,
  question: (
    <>
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" />
      <path d="M12 17.5h.01" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  callout: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 10h10M7 14h6" />
    </>
  ),
  section: <path d="M5 5h14M5 10h14M5 14h14M5 18h9" />,
  part: (
    <>
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
  passage: (
    <>
      <path d="M12 6c-2-1.5-5-2-8-1.5V18c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5c-3-.5-6 0-8 1.5z" />
      <path d="M12 6v13.5" />
    </>
  ),
  station: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  practice: <path d="M5 12.5l4 4L19 7" />,
  prayer: <path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-4 3-6 5-9z" />,
  line: <path d="M6 9h4v4H6zM14 9h4v4h-4zM8 13c0 2-1 3-2 4M16 13c0 2-1 3-2 4" />,
};

export function BlockIcon({ name, className = "" }: { name: BlockIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`w-5 h-5 shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
