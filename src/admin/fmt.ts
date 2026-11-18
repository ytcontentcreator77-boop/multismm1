import { amount, num } from "../format";

/** Stored micro-USD rendered in the administrator's selected display currency. */
export function money(micro: number): string { return amount(micro); }
/** Telegram Stars remain identified only where they are the actual payment rail. */
export const starsText = (n: number) => `${num(Math.round(n))} Telegram Stars`;
/** Legacy secondary labels now use the selected currency instead of presenting Stars as a currency. */
export const usdStars = (micro: number) => money(micro);
export const balStars = (micro: number) => money(micro);
