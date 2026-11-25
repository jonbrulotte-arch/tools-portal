import { cn } from "@/lib/utils";

export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("border border-gray-200 rounded-lg overflow-hidden bg-white", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">{children}</table>
      </div>
    </div>
  );
}

export function Th({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 whitespace-nowrap", className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3 text-sm text-gray-900", className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-t border-gray-200 hover:bg-gray-50", className)} {...props}>
      {children}
    </tr>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr className="border-t border-gray-200">
      <td colSpan={colSpan} className="px-4 py-6 text-sm text-gray-400">
        {children}
      </td>
    </tr>
  );
}

export function RowAction({ className, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn("p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40", danger && "hover:text-red-600", className)}
      {...props}
    />
  );
}
