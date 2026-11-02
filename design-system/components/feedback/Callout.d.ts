import * as React from "react";
export interface CalloutProps {
  title?: string;
  /** Free-form hex color, editor-chosen per instance. Defaults to the brand's amber default. */
  color?: string;
  children: React.ReactNode;
}
export function Callout(props: CalloutProps): JSX.Element;
