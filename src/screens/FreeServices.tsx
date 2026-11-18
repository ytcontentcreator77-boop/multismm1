import { useEffect, useState } from "preact/hooks";
import { api, ApiError } from "../api";
import { LargeTitle, List, Row, Screen, Section, EmptyState, toast, errText } from "../ui";
import { openTelegramLink } from "../tg";

type Item={id:number;name:string;platform:string;category:string;min:number;max:number;resetSeconds:number;lastClaim:number|null};
type Data={enabled:boolean;items:Item[];channels:{id:number;url:string;title:string}[]};
const wait=(s:number)=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h}h ${m}m`:`${m}m`;};
export function FreeServices(){
 const [data,D]=useState<Data|null>(null),[links,L]=useState<Record<number,string>>({}),[qty,Q]=useState<Record<number,string>>({}),[busy,B]=useState<number|null>(null);
 const load=()=>api<Data>("/free-services").then(D).catch(e=>toast(errText(e),"error"));
 useEffect(()=>{void load()},[]);
 const claim=async(s:Item)=>{B(s.id);try{await api("/free-services/claim",{method:"POST",body:{serviceId:s.id,link:links[s.id]||"",quantity:Number(qty[s.id]||s.min)}});toast("Free service claimed successfully","ok");await load();}catch(e){if(e instanceof ApiError && e.code==="JOIN_REQUIRED" && e.details?.url){toast(`Join ${String(e.details.title||"the required channel")} to claim free services`);openTelegramLink(String(e.details.url));}else if(e instanceof ApiError && e.code==="FREE_COOLDOWN"){toast(`You can claim again in ${wait(Number(e.details?.remaining||0))}`);}else toast(errText(e),"error");}finally{B(null)}};
 return <Screen><LargeTitle size="large" title="Free services" sub="Claim free provider services when available"/><Section>{!data?<p>Loading free services…</p>:!data.enabled?<EmptyState title="Free services are unavailable" body="The administrator has temporarily disabled free claims."/>:!data.items.length?<EmptyState title="No free services yet" body="Check back later for available claims."/>:<List>{data.items.map(s=><div class="card pad" key={s.id}><b>{s.name}</b><p class="hint">{s.platform} · {s.category} · Quantity {s.min}–{s.max} · Reset every {wait(s.resetSeconds)}</p><label>Post / profile link<input value={links[s.id]||""} onInput={e=>L(v=>({...v,[s.id]:(e.currentTarget as HTMLInputElement).value}))} placeholder="https://…"/></label><label>Quantity<input type="number" min={s.min} max={s.max} value={qty[s.id]||String(s.min)} onInput={e=>Q(v=>({...v,[s.id]:(e.currentTarget as HTMLInputElement).value}))}/></label><button class="btn primary" disabled={busy!==null} onClick={()=>void claim(s)}>{busy===s.id?"Claiming…":"Claim free service"}</button></div>)}</List>}</Section>{data?.channels.length?<Section header="Required channels"><List>{data.channels.map(c=><Row title={c.title||"Join our channel"} meta="Join before claiming free services" onClick={()=>openTelegramLink(c.url)}/>)}</List></Section>:null}</Screen>;
}
