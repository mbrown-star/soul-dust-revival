import * as React from "react";
export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}
export function ColorPicker(props: ColorPickerProps): JSX.Element;
