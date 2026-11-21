import { decrypt } from "@/lib/crypto";

/** What the browser may know about a hidden saved value: whether it's set and its last 4 characters. */
export type SavedHint = { isSet: boolean; last4: string | null };

export function savedHint(enc: string | null): SavedHint {
  if (!enc) return { isSet: false, last4: null };
  try {
    const v = decrypt(enc);
    return { isSet: true, last4: v.length > 8 ? v.slice(-4) : null };
  } catch {
    return { isSet: true, last4: null };
  }
}
