import * as React from "react";
export interface SelectOption { value: string; label: string; }
export interface SelectProps {
  label?: string;
  id?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  hint?: string;
}
export function Select(props: SelectProps): JSX.Element;
