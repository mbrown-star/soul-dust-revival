import * as React from "react";
export interface BadgeProps {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "error";
}
export function Badge(props: BadgeProps): JSX.Element;
