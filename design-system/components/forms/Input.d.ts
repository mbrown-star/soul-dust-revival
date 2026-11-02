import * as React from "react";
export interface InputProps {
  label?: string;
  id?: string;
  required?: boolean;
  type?: "text" | "email" | "number" | "password";
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** Inline error string; renders in red below the field with role="alert", matches source's alt-text/validation errors. */
  error?: string;
  hint?: string;
}
export function Input(props: InputProps): JSX.Element;
export interface TextareaProps {
  label?: string;
  id?: string;
  required?: boolean;
  rows?: number;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}
export function Textarea(props: TextareaProps): JSX.Element;
