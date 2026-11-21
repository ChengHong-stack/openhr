import { config } from "./config";
export function fmtMoney(v: unknown, currency = config.currency) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(n);
}
export const num = (v: unknown) => Number(v ?? 0);
