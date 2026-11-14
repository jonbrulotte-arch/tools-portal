/* eslint-disable @next/next/no-img-element */
import { getBranding, logoUrl, splitSiteName } from "@/lib/settings";

// gray-900 page with the brand and a centred white card (login, invite, password reset).
export async function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const b = await getBranding();
  const logo = logoUrl(b);
  const [lead, accent] = splitSiteName(b);
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {logo ? (
            <img src={logo} alt={b.siteName} className="mx-auto max-h-14 max-w-[16rem] object-contain" />
          ) : (
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {lead}
              {accent && <span className="text-blue-400">{accent}</span>}
            </h1>
          )}
          {b.tagline && <p className="text-gray-400 mt-1 text-sm">{b.tagline}</p>}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
