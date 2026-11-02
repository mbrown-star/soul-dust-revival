import * as React from "react";
export interface ProgressBarProps {
  completed: number;
  total: number;
}
export function ProgressBar(props: ProgressBarProps): JSX.Element;
