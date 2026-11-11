type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

// Mirrors the Soul Dust Revival Design System's own Button component
// (components/forms/Button.jsx) exactly: same variants, sizes, and the
// token each one maps to. Admin Save/Delete pairs previously hand-rolled
// their own <button> markup per form instead of sharing one component,
// so each form's styling could (and did) drift independently.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white border-transparent focus:ring-ink",
  secondary: "bg-parchment text-ink border-moss/20 focus:ring-ink",
  ghost: "bg-transparent text-moss border-transparent focus:ring-ink",
  danger: "bg-parchment text-error border-moss/20 focus:ring-error",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "px-6 py-3 text-base",
  sm: "px-4 py-2 text-sm",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
  type = "button",
  className = "",
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  // For a button whose visible text is a symbol ("↑"); TypeScript doesn't
  // flag an unknown hyphenated prop, so without this it was silently dropped.
  "aria-label"?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 font-sans font-medium rounded-lg border transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
