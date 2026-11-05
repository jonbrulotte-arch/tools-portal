import { cn } from "@/lib/utils";

export function Alert({ variant = "error", className, children }: { variant?: "error" | "success" | "warning" | "info"; className?: string; children: React.ReactNode }) {
  const styles = {
    error: "rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700",
    success: "rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800",
    warning: "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800",
    info: "rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800",
  }[variant];
  return <div className={cn(styles, className)}>{children}</div>;
}
