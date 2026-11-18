// Rich bot messages: the photo welcome, help, and an owner-only preview of every message type.
import { langLabel, type Lang } from "../shared/types";
import type { Env } from "./env";
import { validHttpsUrl } from "../shared/brand";
import { brandName } from "./brand";
import { botText, escapeHtml, hasCustomBotMessage } from "./i18n";
import { getSettings, setSettings, type Settings } from "./settings";
import { linkButton, tg, webAppButton } from "./telegram";
import { groupInt } from "../shared/num";

/** Whole Stars for bot messages: "1,250 ⭐" */
export const starsText = (stars: number) => `${groupInt(stars)} ⭐`;
export type UserCurrency = { code: string; symbol: string; per_usd: number };
export async function userCurrency(env: Env, userId: number): Promise<UserCurrency> {
  return (await env.DB.prepare(`SELECT c.code,c.symbol,c.per_usd FROM users u JOIN currencies c ON c.code=u.currency WHERE u.id=?1 AND c.enabled=1`).bind(userId).first<UserCurrency>()) ?? {code:"USDT",symbol:"USDT",per_usd:1};
}
/** Stored micro-USD rendered in the selected user currency. */
export const amountText = (micro: number, _s: Settings, currency: UserCurrency = {code:"USDT",symbol:"USDT",per_usd:1}) => {
  const value=Math.abs(micro)/1_000_000*currency.per_usd; const digits=value>=100?0:value>=1?2:4;
  return `${micro<0?"−":""}${currency.symbol}${value.toLocaleString("en-US",{maximumFractionDigits:digits})}`;
};
export const balanceText = (micro: number, s: Settings, currency: UserCurrency = {code:"USDT",symbol:"USDT",per_usd:1}) => amountText(micro,s,currency);
/** Common dynamic placeholders for owner-customized Telegram templates. */
export async function userMessageVars(env: Env, userId: number, name = ""): Promise<Record<string,string>> {
  const [u, stats, claims, referrals, deposits, tickets, settings] = await Promise.all([
    env.DB.prepare("SELECT first_name,last_name,username,balance,created_at FROM users WHERE id=?1").bind(userId).first<any>(),
    env.DB.prepare("SELECT COUNT(*) AS totalorders,COALESCE(SUM(charge),0) AS totalspent,COALESCE(SUM(refund),0) AS totalrefund FROM orders WHERE user_id=?1").bind(userId).first<any>(),
    env.DB.prepare("SELECT COUNT(*) AS totalfreeclaim FROM free_claims WHERE user_id=?1").bind(userId).first<any>(),
    env.DB.prepare("SELECT COUNT(*) AS totalreferral FROM referrals WHERE referrer_id=?1").bind(userId).first<any>(),
    env.DB.prepare("SELECT COUNT(*) AS totaldeposits,COALESCE(SUM(credit_usd),0) AS depositamount FROM manual_deposits WHERE user_id=?1 AND status='approved'").bind(userId).first<any>(),
    env.DB.prepare("SELECT COUNT(*) AS totaltickets FROM tickets WHERE user_id=?1").bind(userId).first<any>(),
    getSettings(env),
  ]);
  const cur=await userCurrency(env,userId); const full=name||[u?.first_name,u?.last_name].filter(Boolean).join(" ")||"there";
  const joined=u?.created_at?new Date(Number(u.created_at)*1000).toISOString().slice(0,10):"";
  return {name:full,firstname:u?.first_name||full,lastname:u?.last_name||"",username:u?.username?`@${u.username}`:"",userid:String(userId),currency:cur.code,currency_symbol:cur.symbol,totalorders:String(stats?.totalorders||0),totalspent:amountText(Number(stats?.totalspent||0),settings,cur),totalrefund:amountText(Number(stats?.totalrefund||0),settings,cur),totalfreeclaim:String(claims?.totalfreeclaim||0),totalreferral:String(referrals?.totalreferral||0),totaldeposits:String(deposits?.totaldeposits||0),depositamount:amountText(Number(deposits?.depositamount||0),settings,cur),totaltickets:String(tickets?.totaltickets||0),balance:balanceText(Number(u?.balance||0),settings,cur),joined,created:joined,date:new Date().toISOString().slice(0,10),support:supportHandle(settings),brand:brandName(settings)};
}
export const supportHandle = (s: Settings) => (s.support_username ? "@" + s.support_username : s.bot_username ? "@" + s.bot_username : brandName(s));
/** Telegram links in captions: show without the scheme and keep them short */
export const linkText = (link: string) => {
  const l = link.replace(/^https?:\/\/(www\.)?/, "");
  return l.length > 48 ? l.slice(0, 47) + "…" : l;
};

export function openButton(lang: Lang, s: Settings, path = "") {
  return s.app_url ? webAppButton(botText(lang, "open"), `${s.app_url}${path}`) : null;
}

/** The owner's welcome text (plain text, escaped here) with {name} and {brand} filled in */
export function customWelcome(template: string, name: string, brand: string): string {
  return escapeHtml(template).replace(/\{name\}/g, escapeHtml(name)).replace(/\{brand\}/g, escapeHtml(brand));
}

/**
 * Welcome with the owner's banner (if one is uploaded), the feature caption and an Open button; text only otherwise.
 * Reuses Telegram's file_id after the first send; a new banner changes the URL (banner_ver), which drops the cache.
 */
export async function sendWelcome(env: Env, chatId: number, lang: Lang, name: string): Promise<void> {
  const s = await getSettings(env);
  const open = openButton(lang, s);
  const reply_markup = open ? { inline_keyboard: [[open]] } : undefined;
  const vars = await userMessageVars(env,chatId,name);
  const caption = hasCustomBotMessage("welcome") ? botText(lang, "welcome", vars) : s.welcome_text.trim() ? customWelcome(s.welcome_text, name || "there", brandName(s)) : botText(lang, "welcome", vars);
  const url = s.app_url && s.banner_ver > 0 ? `${s.app_url}/media/banner?v=${s.banner_ver}` : "";
  if (url) {
    const [cachedUrl, fileId] = (s.welcome_photo || "|").split("|");
    const photo = fileId && cachedUrl === url ? fileId : url;
    try {
      const msg = await tg<{ photo?: { file_id: string }[] }>(env.BOT_TOKEN, "sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML", reply_markup });
      const id = msg.photo?.at(-1)?.file_id;
      if (id && photo === url) await setSettings(env, { welcome_photo: `${url}|${id}` });
      return;
    } catch (e) {
      console.warn("welcome photo failed, sending text", (e as Error).message);
    }
  }
  await tg(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup });
}

/** Terms button: the owner's terms link, else the in-app terms page, else none */
export function termsButton(lang: Lang, s: Settings) {
  if (validHttpsUrl(s.terms_url)) return linkButton(botText(lang, "termsButton"), s.terms_url, "terms");
  if (s.app_url) return webAppButton(botText(lang, "termsButton"), `${s.app_url}/#/terms`, "terms");
  return null;
}

export async function sendHelp(env: Env, chatId: number, lang: Lang, key: "help" | "paysupport" = "help"): Promise<void> {
  const s = await getSettings(env);
  const open = openButton(lang, s);
  const terms = termsButton(lang, s);
  const rows = [...(open ? [[open]] : []), ...(terms ? [[terms]] : [])];
  await tg(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text: botText(lang, key, { support: supportHandle(s) }),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: rows.length ? { inline_keyboard: rows } : undefined,
  });
}

export function languageKeyboard(langs: readonly Lang[]) {
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < langs.length; i += 2) rows.push(langs.slice(i, i + 2).map((l) => ({ text: langLabel(l), callback_data: `lang:${l}` })));
  return { inline_keyboard: rows };
}

/** Owner preview: sends one of every message type with sample data, in the given language. */
export async function sendPreviews(env: Env, chatId: number, lang: Lang, name: string, langs: readonly Lang[]): Promise<number> {
  const s = await getSettings(env);
  const sample = { id: "16502", service: "Telegram Post Views — Real", quantity: "1,000", link: "t.me/example/42", refund: "USDT 0.27", amount: "USDT 5.00", balance: "USDT 12.40", reason: "LINK_BUSY" };
  const view = s.app_url ? { inline_keyboard: [[webAppButton(botText(lang, "viewOrder"), `${s.app_url}/#/orders`, "viewOrder")]] } : undefined;
  const open = openButton(lang, s);
  const send = (text: string, reply_markup?: unknown) =>
    tg(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup });
  let n = 0;
  await send(`🧪 <b>Bot message previews</b> · ${langLabel(lang)}\nSample data, nothing was charged.`);
  await send(botText(lang, "chooseLanguage"), languageKeyboard(langs)), n++;
  await sendWelcome(env, chatId, lang, name), n++;
  await sendHelp(env, chatId, lang), n++;
  await sendHelp(env, chatId, lang, "paysupport"), n++;
  for (const key of ["orderPlaced", "orderCompleted", "orderPartial", "orderCancelled", "orderFailed"] as const) await send(botText(lang, key, sample), view), n++;
  await send(botText(lang, "topupDone", sample), open ? { inline_keyboard: [[open]] } : undefined), n++;
  await send(botText(lang, "orderNotPlaced", sample), open ? { inline_keyboard: [[open]] } : undefined), n++;
  for (const key of ["orderRefunded", "starsRefunded"] as const) await send(botText(lang, key, sample)), n++;
  return n;
}
