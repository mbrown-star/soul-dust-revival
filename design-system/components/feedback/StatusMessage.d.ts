import * as React from "react";
export interface StatusMessageProps {
  children?: React.ReactNode;
  tone?: "muted" | "error" | "success" | "warning";
}
export function StatusMessage(props: StatusMessageProps): JSX.Element;
