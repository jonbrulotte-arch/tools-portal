import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, optional, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { optional?: boolean }) {
  return (
    <label className={cn("block text-sm font-medium text-gray-700 mb-1.5", className)} {...props}>
      {children}
      {optional && <span className="text-gray-400 font-normal"> (optional)</span>}
    </label>
  );
}
