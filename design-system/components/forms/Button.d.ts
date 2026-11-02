import * as React from "react";
export interface ButtonProps {
  children: React.ReactNode;
  /** Visual treatment. Source only ever uses a solid inverted-ink button (`primary`); secondary/ghost/danger are intentional additions for coverage — see readme "Intentional additions". */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}
export function Button(props: ButtonProps): JSX.Element;
