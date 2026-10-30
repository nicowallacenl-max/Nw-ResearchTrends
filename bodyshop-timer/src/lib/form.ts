// Small helpers for reading FormData in Server Actions.
export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const optStr = (f: FormData, k: string) => str(f, k) || null;
// Returns null when the field is empty or not a number, so actions can show a friendly error.
export const num = (f: FormData, k: string) => {
  const s = str(f, k);
  const n = Number(s);
  return s === "" || !Number.isFinite(n) ? null : n;
};
