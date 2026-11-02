import * as React from "react";
export interface ProductRowProps {
  imageUrl?: string | null;
  title: string;
  meta: string;
  href?: string;
  onClick?: () => void;
}
export function ProductRow(props: ProductRowProps): JSX.Element;
