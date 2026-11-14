import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashToken } from "@/lib/crypto";

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("shpat_secret");
    const b = encrypt("shpat_secret");
    expect(a).not.toEqual(b);
    expect(decrypt(a)).toBe("shpat_secret");
  });
  it("rejects tampered ciphertext", () => {
    const parts = encrypt("x").split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
  it("hashes tokens deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toHaveLength(64);
  });
});
