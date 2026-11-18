import { Hono } from "hono";
import { isOwner } from "../env";
import { getProvider, importServices, listRemote, smm, type Provider } from "../providers";
import { type AppEnv, err } from "./app";
import { amountText, userCurrency } from "../botMessages";
import { getSettings } from "../settings";
import { tg } from "../telegram";

export const providers = new Hono<AppEnv>();
providers.use("*", async (c, next) => (isOwner(c.env, c.get("settings"), c.get("user").id) ? next() : err(c, 403, "FORBIDDEN")));

const mask = (p: Provider) => ({ ...p, api_key: p.api_key.slice(0, 4) + "••••" });
const validImageRef = (v: unknown): v is string => typeof v === "string" && v.length <= 1_100_000 && (/^https:\/\//i.test(v) || /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v));

providers.get("/providers", async (c) => c.json({ items: (await c.env.DB.prepare("SELECT * FROM providers ORDER BY id").all<Provider>()).results.map(mask) }));

providers.post("/providers", async (c) => {
  const b = await c.req.json<{ name: string; api_url: string; api_key: string; usd_rate?: number }>().catch(() => null);
  if (!b?.name || !b.api_url || !b.api_key) return err(c, 400, "BAD_REQUEST");
  try { await smm({ api_url: b.api_url, api_key: b.api_key }, "balance"); } catch (e) { return err(c, 400, "PROVIDER_REJECTED"); }
  const r = await c.env.DB.prepare("INSERT INTO providers (name, api_url, api_key, usd_rate, created_at) VALUES (?1,?2,?3,?4,?5)").bind(b.name.slice(0, 60), b.api_url, b.api_key, b.usd_rate || 1, Date.now()).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});


providers.put("/providers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const current = await getProvider(c.env, id);
  if (!current) return err(c, 404, "NOT_FOUND");
  const b = await c.req.json<{ name?: string; api_url?: string; api_key?: string; usd_rate?: number; enabled?: boolean }>().catch(() => null);
  if (!b) return err(c, 400, "BAD_REQUEST");
  const next = { ...current, ...b };
  const credentialsChanged = (b.api_url !== undefined && b.api_url !== current.api_url) || (b.api_key !== undefined && b.api_key !== current.api_key);
  if (credentialsChanged) {
    const active = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE provider_id = ?1 AND status IN ('submitting','pending','processing','in_progress')").bind(id).first<{n:number}>();
    if ((active?.n ?? 0) > 0) return err(c, 409, "PROVIDER_HAS_OPEN_ORDERS", { count: active?.n });
    try { await smm({ api_url: next.api_url, api_key: next.api_key }, "balance"); }
    catch { return err(c, 400, "PROVIDER_REJECTED"); }
  }
  if (b.usd_rate !== undefined && (!Number.isFinite(b.usd_rate) || b.usd_rate <= 0)) return err(c, 400, "BAD_REQUEST");
  await c.env.DB.prepare("UPDATE providers SET name=?1,api_url=?2,api_key=?3,usd_rate=?4,enabled=?5 WHERE id=?6")
    .bind((next.name || current.name).slice(0,60), next.api_url || current.api_url, next.api_key || current.api_key, next.usd_rate || current.usd_rate, b.enabled === undefined ? current.enabled : +b.enabled, id).run();
  return c.json({ ok: true });
});

providers.delete("/providers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const active = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE provider_id = ?1 AND status IN ('submitting','pending','processing','in_progress')").bind(id).first<{n:number}>();
  if ((active?.n ?? 0) > 0) return err(c, 409, "PROVIDER_HAS_OPEN_ORDERS", { count: active?.n });
  await c.env.DB.prepare("UPDATE services SET enabled = 0 WHERE provider_id = ?1").bind(id).run();
  await c.env.DB.prepare("DELETE FROM providers WHERE id = ?1").bind(id).run();
  return c.json({ ok: true });
});

/** Categories (with counts and cheapest rate) of one provider, to pick from before importing. */
providers.get("/providers/:id/catalog", async (c) => {
  const p = await getProvider(c.env, Number(c.req.param("id")));
  if (!p) return err(c, 404, "NOT_FOUND");
  const q = (c.req.query("category") ?? "").toLowerCase();
  const all = await listRemote(p);
  const cats = new Map<string, number>();
  for (const s of all) cats.set(s.category, (cats.get(s.category) ?? 0) + 1);
  const services = q ? all.filter((s) => s.category.toLowerCase() === q).slice(0, 500) : [];
  return c.json({ categories: [...cats].map(([name, count]) => ({ name, count })), services });
});

providers.post("/providers/:id/import", async (c) => {
  const p = await getProvider(c.env, Number(c.req.param("id")));
  const b = await c.req.json<{ ids: (string | number)[]; platform: string }>().catch(() => null);
  if (!p || !p.enabled || !b?.ids?.length) return err(c, 400, "BAD_REQUEST");
  return c.json({ ok: true, imported: await importServices(c.env, p, b.ids.slice(0, 500), b.platform || "other") });
});

providers.put("/icons/service/:id", async (c) => {
  const b = await c.req.json<{ icon: string }>().catch(() => null);
  await c.env.DB.prepare("UPDATE services SET icon = ?1 WHERE id = ?2").bind((b?.icon ?? "").slice(0, 300), Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

providers.put("/icons/category", async (c) => {
  const b = await c.req.json<{ platform: string; category: string; icon: string }>().catch(() => null);
  if (!b) return err(c, 400, "BAD_REQUEST");
  await c.env.DB.prepare("INSERT INTO category_icons (platform, category, icon) VALUES (?1,?2,?3) ON CONFLICT DO UPDATE SET icon = excluded.icon").bind(b.platform, b.category, b.icon.slice(0, 300)).run();
  return c.json({ ok: true });
});

providers.get("/currencies", async (c) => c.json({ items: (await c.env.DB.prepare("SELECT * FROM currencies ORDER BY code").all()).results }));
providers.post("/currencies", async (c) => {
  const b = await c.req.json<{code:string;name:string;symbol:string;per_usd:number}>().catch(() => null);
  if (!b || !/^[A-Z0-9]{2,8}$/.test(b.code) || !b.name?.trim() || !b.symbol?.trim() || !Number.isFinite(b.per_usd) || b.per_usd <= 0) return err(c,400,"BAD_REQUEST");
  await c.env.DB.prepare("INSERT INTO currencies(code,name,symbol,per_usd,enabled) VALUES(?1,?2,?3,?4,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,symbol=excluded.symbol,per_usd=excluded.per_usd,enabled=1").bind(b.code,b.name.trim().slice(0,60),b.symbol.trim().slice(0,12),b.per_usd).run();
  return c.json({ok:true});
});
providers.put("/currencies/:code", async (c) => {
  const b = await c.req.json<{ per_usd?: number; enabled?: boolean }>().catch(() => null);
  if (!b) return err(c, 400, "BAD_REQUEST");
  await c.env.DB.prepare("UPDATE currencies SET per_usd = COALESCE(?1, per_usd), enabled = COALESCE(?2, enabled) WHERE code = ?3").bind(b.per_usd ?? null, b.enabled === undefined ? null : +b.enabled, c.req.param("code")).run();
  return c.json({ ok: true });
});

providers.get("/payment-methods", async (c) => c.json({ items: (await c.env.DB.prepare("SELECT id,name,kind,currency,details,min_amount,max_amount,fee_pct,bonus_pct,qr_url,icon,enabled,sort FROM payment_methods ORDER BY sort").all()).results }));
providers.put("/payment-methods/:id", async (c) => {
  const b = await c.req.json<Record<string, any>>().catch(() => null);
  if (!b) return err(c, 400, "BAD_REQUEST");
  if (b.currency && !(await c.env.DB.prepare("SELECT 1 FROM currencies WHERE code=?1 AND enabled=1").bind(b.currency).first())) return err(c,400,"INVALID_CURRENCY");
  if (b.qr_url && !validImageRef(b.qr_url)) return err(c,400,"INVALID_IMAGE");
  if (b.min_amount !== undefined && Number(b.min_amount)<=0 || b.max_amount !== undefined && Number(b.max_amount)<0 || b.fee_pct !== undefined && (Number(b.fee_pct)<0 || Number(b.fee_pct)>100) || b.bonus_pct !== undefined && (Number(b.bonus_pct)<0 || Number(b.bonus_pct)>500)) return err(c,400,"INVALID_LIMITS");
  await c.env.DB.prepare("UPDATE payment_methods SET name=COALESCE(?1,name), details=COALESCE(?2,details), currency=COALESCE(?3,currency), min_amount=COALESCE(?4,min_amount), fee_pct=COALESCE(?5,fee_pct), icon=COALESCE(?6,icon), enabled=COALESCE(?7,enabled), api_url=COALESCE(?8,api_url), api_key=COALESCE(?9,api_key), max_amount=COALESCE(?10,max_amount), bonus_pct=COALESCE(?11,bonus_pct), qr_url=COALESCE(?12,qr_url) WHERE id=?13")
    .bind(b.name ?? null, b.details ?? null, b.currency ?? null, b.min_amount ?? null, b.fee_pct ?? null, b.icon ?? null, b.enabled === undefined ? null : +b.enabled, b.api_url ?? null, b.api_key ?? null, b.max_amount ?? null, b.bonus_pct ?? null, b.qr_url ?? null, c.req.param("id")).run();
  return c.json({ ok: true });
});


// Free-service configuration. Services are selected from already-imported provider services.
providers.get("/free-services", async (c) => {
  const [services, channels, candidates] = await Promise.all([
    c.env.DB.prepare(`SELECT f.*,s.name,s.platform,s.category,s.min AS service_min,s.max AS service_max,s.provider_id FROM free_services f JOIN services s ON s.id=f.service_id ORDER BY s.platform,s.category,s.name`).all(),
    c.env.DB.prepare("SELECT * FROM free_service_channels ORDER BY id").all(),
    c.env.DB.prepare("SELECT s.id,s.name,s.platform,s.category,s.min,s.max,s.provider_id,p.name AS provider_name FROM services s JOIN providers p ON p.id=s.provider_id AND p.enabled=1 WHERE s.provider_id>0 AND s.enabled=1 AND s.type_key IN ('default','') ORDER BY p.name,s.category,s.name LIMIT 1000").all(),
  ]);
  return c.json({ enabled: Number((await c.env.DB.prepare("SELECT value FROM settings WHERE key='free_services_enabled'").first<any>())?.value ?? 0), requireJoin: Number((await c.env.DB.prepare("SELECT value FROM settings WHERE key='free_channel_gate'").first<any>())?.value ?? 0), services: services.results, channels: channels.results, candidates: candidates.results });
});
providers.put("/free-services/settings", async (c) => {
  const b = await c.req.json<{enabled:boolean;requireJoin?:boolean}>().catch(()=>null);
  if (!b) return err(c,400,"BAD_REQUEST");
  if (b.requireJoin && !(await c.env.DB.prepare("SELECT 1 FROM free_service_channels WHERE enabled=1 LIMIT 1").first())) return err(c,400,"ADD_CHANNEL_FIRST");
  await c.env.DB.batch([c.env.DB.prepare("INSERT INTO settings(key,value) VALUES('free_services_enabled',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.enabled?"1":"0"),c.env.DB.prepare("INSERT INTO settings(key,value) VALUES('free_channel_gate',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.requireJoin?"1":"0")]);
  return c.json({ok:true});
});
providers.post("/free-services", async (c) => {
  const b = await c.req.json<{serviceId:number;min:number;max:number;resetSeconds:number;enabled?:boolean}>().catch(()=>null);
  if (!b || !Number.isSafeInteger(b.serviceId) || !Number.isInteger(b.min) || !Number.isInteger(b.max) || b.min<1 || b.max<b.min || !Number.isInteger(b.resetSeconds) || b.resetSeconds<3600) return err(c,400,"BAD_REQUEST");
  const svc = await c.env.DB.prepare("SELECT id,min,max,provider_id FROM services WHERE id=?1 AND enabled=1 AND provider_id>0 AND type_key IN ('default','')").bind(b.serviceId).first<any>();
  if (!svc || b.min<svc.min || b.max>svc.max) return err(c,400,"INVALID_SERVICE_RANGE");
  await c.env.DB.prepare("INSERT INTO free_services(service_id,enabled,min_qty,max_qty,reset_seconds,created_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(service_id) DO UPDATE SET enabled=excluded.enabled,min_qty=excluded.min_qty,max_qty=excluded.max_qty,reset_seconds=excluded.reset_seconds").bind(b.serviceId,b.enabled===false?0:1,b.min,b.max,b.resetSeconds,Math.floor(Date.now()/1000)).run();
  return c.json({ok:true});
});
providers.delete("/free-services/:id", async (c) => { await c.env.DB.prepare("DELETE FROM free_services WHERE service_id=?1").bind(Number(c.req.param("id"))).run(); return c.json({ok:true}); });
providers.post("/free-services/channels", async (c) => {
  const b=await c.req.json<{chatId:string;url:string;title?:string}>().catch(()=>null);
  if(!b?.chatId?.trim() || !/^https:\/\/t\.me\//.test(b.url||"")) return err(c,400,"BAD_REQUEST");
  await c.env.DB.prepare("INSERT INTO free_service_channels(chat_id,url,title) VALUES(?1,?2,?3)").bind(b.chatId.trim(),b.url,b.title?.slice(0,100)||"").run(); return c.json({ok:true});
});
providers.delete("/free-services/channels/:id", async(c)=>{await c.env.DB.prepare("DELETE FROM free_service_channels WHERE id=?1").bind(Number(c.req.param("id"))).run();return c.json({ok:true});});


// Manual-payment administration and review queue.
providers.post("/payment-methods", async c=>{
 const b=await c.req.json<any>().catch(()=>null);
 if(!b?.id || !b.name?.trim() || !b.currency || !b.details?.trim() || (b.qr_url && !validImageRef(b.qr_url))) return err(c,400,"BAD_REQUEST");
 const id=String(b.id).toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40); if(!id || id==="stars")return err(c,400,"BAD_REQUEST");
 const currency=await c.env.DB.prepare("SELECT 1 FROM currencies WHERE code=?1 AND enabled=1").bind(b.currency).first(); if(!currency)return err(c,400,"INVALID_CURRENCY");
 if(Number(b.min_amount)<=0 || Number(b.max_amount)<0 || (Number(b.max_amount)>0 && Number(b.max_amount)<Number(b.min_amount)) || Number(b.fee_pct)<0 || Number(b.fee_pct)>100 || Number(b.bonus_pct)<0 || Number(b.bonus_pct)>500)return err(c,400,"INVALID_LIMITS");
 await c.env.DB.prepare(`INSERT INTO payment_methods(id,name,kind,currency,details,min_amount,max_amount,fee_pct,bonus_pct,icon,qr_url,enabled,sort) VALUES(?1,?2,'manual',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(id) DO UPDATE SET name=excluded.name,currency=excluded.currency,details=excluded.details,min_amount=excluded.min_amount,max_amount=excluded.max_amount,fee_pct=excluded.fee_pct,bonus_pct=excluded.bonus_pct,icon=excluded.icon,qr_url=excluded.qr_url,enabled=excluded.enabled,sort=excluded.sort`).bind(id,b.name.trim().slice(0,80),b.currency,b.details.slice(0,3000),Number(b.min_amount)||1,Number(b.max_amount)||0,Number(b.fee_pct)||0,Number(b.bonus_pct)||0,String(b.icon||"💳").slice(0,20),String(b.qr_url||"").slice(0,1200000)||null,b.enabled===false?0:1,Number(b.sort)||20).run(); return c.json({ok:true,id});
});
providers.get("/manual-deposits",async c=>{
 const status=c.req.query("status")||"pending"; const items=await c.env.DB.prepare(`SELECT d.*,u.first_name,u.username,m.name AS method_name,m.currency FROM manual_deposits d JOIN users u ON u.id=d.user_id LEFT JOIN payment_methods m ON m.id=d.method_id WHERE (?1='all' OR d.status=?1) ORDER BY d.id DESC LIMIT 200`).bind(status).all(); return c.json({items:items.results});
});
providers.post("/manual-deposits/:id/review",async c=>{
 const id=Number(c.req.param("id")); const b=await c.req.json<{action:"approve"|"reject";note?:string}>().catch(()=>null); if(!b || !["approve","reject"].includes(b.action))return err(c,400,"BAD_REQUEST");
 const d=await c.env.DB.prepare("SELECT * FROM manual_deposits WHERE id=?1 AND status='pending'").bind(id).first<any>(); if(!d)return err(c,404,"NOT_PENDING"); const now=Math.floor(Date.now()/1000); const status=b.action==='approve'?'approved':'rejected';
 const stmts=[c.env.DB.prepare("UPDATE manual_deposits SET status=?1,admin_note=?2,reviewed_at=?3 WHERE id=?4 AND status='pending'").bind(status,(b.note||"").slice(0,500),now,id)];
 if(b.action==='approve'){stmts.push(c.env.DB.prepare("UPDATE users SET balance=balance+?1 WHERE id=?2 AND changes()=1").bind(d.credit_usd,d.user_id));stmts.push(c.env.DB.prepare("INSERT INTO ledger(user_id,delta,kind,ref,note,created_at) SELECT ?1,?2,'manual_topup',?3,?4,?5 WHERE changes()=1").bind(d.user_id,d.credit_usd,id,`Manual deposit #${id}`,now));}
 const results=await c.env.DB.batch(stmts); if((results[0] as any)?.meta?.changes){
   const user=await c.env.DB.prepare("SELECT balance,lang,language_code,can_message FROM users WHERE id=?1").bind(d.user_id).first<any>();
   if(user?.can_message){const settings=await getSettings(c.env);const cur=await userCurrency(c.env,d.user_id);const msg=b.action==='approve'?`DEPOSIT APPROVED\nAdded: ${amountText(d.credit_usd,settings,cur)}\nBalance: ${amountText(user.balance,settings,cur)}`:`DEPOSIT REJECTED\nRequest #${id} was rejected.${b.note?`\nReason: ${b.note}`:''}`;try{await tg(c.env.BOT_TOKEN,"sendMessage",{chat_id:d.user_id,text:msg})}catch{}}
 }
 return c.json({ok:true,status});
});

// Ticket support desk.
providers.get("/tickets",async c=>{const status=c.req.query("status")||"open";const items=await c.env.DB.prepare(`SELECT t.*,u.first_name,u.username,(SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id=t.id) AS messages FROM tickets t JOIN users u ON u.id=t.user_id WHERE (?1='all' OR t.status=?1) ORDER BY t.updated_at DESC LIMIT 200`).bind(status).all();return c.json({items:items.results});});
providers.get("/tickets/:id",async c=>{const id=Number(c.req.param("id"));const ticket=await c.env.DB.prepare("SELECT t.*,u.first_name,u.username FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?1").bind(id).first<any>();if(!ticket)return err(c,404,"NOT_FOUND");const messages=await c.env.DB.prepare("SELECT * FROM ticket_messages WHERE ticket_id=?1 ORDER BY id").bind(id).all();return c.json({ticket,messages:messages.results});});
providers.post("/tickets/:id/reply",async c=>{const id=Number(c.req.param("id"));const b=await c.req.json<{body:string;imageUrl?:string;close?:boolean}>().catch(()=>null);if(!b || (!b.body?.trim()&&!b.imageUrl) || (b.imageUrl && !validImageRef(b.imageUrl)))return err(c,400,"BAD_REQUEST");const t=await c.env.DB.prepare("SELECT user_id,status FROM tickets WHERE id=?1").bind(id).first<any>();if(!t)return err(c,404,"NOT_FOUND");const now=Math.floor(Date.now()/1000);await c.env.DB.batch([c.env.DB.prepare("INSERT INTO ticket_messages(ticket_id,sender_id,sender_role,body,image_url,created_at) VALUES(?1,?2,'admin',?3,?4,?5)").bind(id,c.get("user").id,(b.body||"").slice(0,4000),(b.imageUrl||"").slice(0,1200000)||null,now),c.env.DB.prepare("UPDATE tickets SET status=?1,updated_at=?2,closed_at=?3 WHERE id=?4").bind(b.close?"closed":"open",now,b.close?now:null,id)]);const u=await c.env.DB.prepare("SELECT can_message FROM users WHERE id=?1").bind(t.user_id).first<any>();if(u?.can_message){try{await tg(c.env.BOT_TOKEN,"sendMessage",{chat_id:t.user_id,text:`Support replied to ticket #${id}\n${(b.body||"New image attachment").slice(0,1500)}`})}catch{}}return c.json({ok:true});});
providers.post("/tickets/:id/close",async c=>{const now=Math.floor(Date.now()/1000);await c.env.DB.prepare("UPDATE tickets SET status='closed',closed_at=?1,updated_at=?1 WHERE id=?2").bind(now,Number(c.req.param("id"))).run();return c.json({ok:true});});
