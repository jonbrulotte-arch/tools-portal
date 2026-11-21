/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

export type BrandInfo = { siteName: string; accentWord: string; logoUrl: string | null };

function split(siteName: string, accent: string): [string, string] {
  const name = siteName.trim();
  const a = accent.trim();
  if (a && name.endsWith(a) && name.length > a.length) return [name.slice(0, name.length - a.length), a];
  return [name, ""];
}

/** Site name with the accent word in blue-400 (dark backgrounds), or the uploaded logo. */
export function BrandMark({ brand, className, imgClassName }: { brand: BrandInfo; className?: string; imgClassName?: string }) {
  if (brand.logoUrl) return <img src={brand.logoUrl} alt={brand.siteName} className={cn("max-h-8 max-w-[10rem] object-contain", imgClassName)} />;
  const [lead, accent] = split(brand.siteName, brand.accentWord);
  return (
    <span className={cn("font-bold text-white tracking-tight", className)}>
      {lead}
      {accent && <span className="text-blue-400">{accent}</span>}
    </span>
  );
}
