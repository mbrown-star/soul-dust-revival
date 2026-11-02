import * as React from "react";
export interface CheckboxProps {
  id?: string;
  label: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}
export function Checkbox(props: CheckboxProps): JSX.Element;
