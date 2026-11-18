import { useEffect,useState } from "preact/hooks";
import { api } from "../api";
import { meStore } from "../store";
import { balance } from "../format";
import { BackNav,BottomButtons,LargeTitle,Num,Screen,Section,toast,errText } from "../ui";
import { navigate } from "../router";

type Method={id:string;name:string;currency:string;details:string;min_amount:number;max_amount:number;fee_pct:number;bonus_pct:number;icon:string;qr_url:string|null};
export function ManualDeposit(){
 const me=meStore.use()!; const [methods,M]=useState<Method[]>([]),[id,I]=useState(""),[amount,A]=useState(""),[ref,R]=useState(""),[proof,P]=useState(""),[busy,B]=useState(false),[history,H]=useState<any[]>([]);
 useEffect(()=>{void api<{items:Method[]}>('/wallet/manual-methods').then(x=>{M(x.items);if(x.items[0])I(x.items[0].id)});void api<{items:any[]}>('/wallet/manual-deposits').then(x=>H(x.items))},[]);
 const selected=methods.find(x=>x.id===id);
 const upload=(e:Event)=>{const f=(e.currentTarget as HTMLInputElement).files?.[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>800000){toast('Choose an image under 800 KB','error');return}const r=new FileReader();r.onload=()=>P(String(r.result||''));r.readAsDataURL(f)};
 const submit=async()=>{if(!selected||!Number(amount)||Number(amount)<selected.min_amount||(selected.max_amount>0&&Number(amount)>selected.max_amount))return toast('Enter a valid amount','error');B(true);try{await api('/wallet/manual-deposits',{body:{methodId:id,amount:Number(amount),reference:ref,proofUrl:proof}});toast('Deposit request submitted for review','ok');navigate('/wallet')}catch(e){toast(errText(e),'error')}B(false)};
 return <><BackNav to="/wallet"/><Screen bottom="native" overlay={<BottomButtons main={{text:busy?'Submitting…':'Submit deposit request',progress:busy,onClick:()=>void submit()}} secondary={{text:'Back',onClick:()=>navigate('/wallet')}}/>}><LargeTitle title="Manual deposit" sub={`Your balance: ${balance(me.balance)}`}/>
 <Section header="Choose payment method"><div class="card pad"><select value={id} onChange={e=>I(e.currentTarget.value)}>{methods.map(m=><option value={m.id}>{m.icon} {m.name} · {m.currency}</option>)}</select></div></Section>
 {selected?<><Section header={`Payment instructions · ${selected.name}`}><div class="card pad"><p>{selected.details}</p>{selected.qr_url?<img src={selected.qr_url} alt="Payment QR" style={{maxWidth:'100%',maxHeight:'280px',objectFit:'contain'}}/>:null}<p class="hint">Min {selected.currency} {selected.min_amount}{selected.max_amount>0?` · Max ${selected.max_amount}`:''} · Fee {selected.fee_pct}% · Bonus {selected.bonus_pct}%</p></div></Section>
 <Section header={`Amount (${selected.currency})`}><input type="number" min={selected.min_amount} max={selected.max_amount||undefined} value={amount} onInput={e=>A(e.currentTarget.value)} placeholder="Enter amount"/></Section>
 <Section header="Payment reference / transaction ID"><input value={ref} onInput={e=>R(e.currentTarget.value)} placeholder="Transaction ID or sender details"/></Section>
 <Section header="Upload payment screenshot"><input type="file" accept="image/*" onChange={upload}/>{proof?<img src={proof} alt="Payment proof preview" style={{maxWidth:'100%',maxHeight:'220px'}}/>:null}</Section></>:<p class="hint">No manual payment methods are enabled. Please contact support.</p>}
 <Section header="Recent manual deposits">{history.map(x=><div class="card pad"><b>#{x.id} · {x.method_name}</b><p>{x.currency} {x.amount} · {x.status}</p>{x.admin_note?<small>{x.admin_note}</small>:null}</div>)}</Section>
 </Screen></>;
}
