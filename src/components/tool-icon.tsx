import {
  BarChart3,
  Box,
  Calculator,
  ClipboardList,
  FileSpreadsheet,
  Globe,
  Mail,
  Package,
  ShoppingCart,
  Tag,
  TicketPercent,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Icons an admin can choose for a tool (Admin → Tools).
export const TOOL_ICONS: Record<string, LucideIcon> = {
  TicketPercent,
  Tag,
  ShoppingCart,
  Package,
  Box,
  Truck,
  BarChart3,
  Calculator,
  ClipboardList,
  FileSpreadsheet,
  Globe,
  Mail,
  Wrench,
};

export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TOOL_ICONS[name] ?? Wrench;
  return <Icon className={className} />;
}
