"use strict";
const KEY="account_status_report_v2";
const uid=()=>Math.random().toString(36).slice(2,9);
const POS_STAGES=["Confirmed","In Production","Inspection","Cargo Ready","Booked","Loaded","In Transit","Arrived"];
const INSP_STATES=["Pending","Booked","Concluded","Passed"];
const NEG_STAGES=["Inquiry","Proposal"];
const NEG_OUTCOMES=["Open","Won","Lost"];
const NEG_SAMPLES=["N/A","Requested","Pending","Delivered","Approved","Rejected"];
const ACT_TYPES=[["red","Action required"],["gold","Watch"],["blue","Logistics"],["client","Client"],["grn","Positive"]];
const ACT_SYM={red:"!",gold:"◆",blue:"⇢",client:"◑",grn:"✓"};
const DELIVERED_MODES=["Hidden","Count","Listed"];
const STOPS=["Inquiry","Proposal","PO Confirmed","Production","Inspection","Cargo Ready","Booked","Loaded","In Transit","Arrived","Delivered"];
const PALETTE=["#B8860B","#1B2A4A","#3C5C7A","#6B5AA6","#2E7D57","#9A5B12","#2C6C7C","#8A5A2B"];
const PROB={Inquiry:0.25,Proposal:0.70};
let pendingWonAlert=null, reportMode="client";

function blankData(name){return {meta:{company:"YOUR LOGO",title:"Account Status Report",client:name||"New Client",accountManager:"Trading Desk",period:"",issued:"",reportNo:"",tradeLane:"China → Brazil (BR)",preparedBy:"Trading Desk",contact:"desk@company.com"},kpi:{activeFoot:"vs. last month",transitFoot:"upcoming arrivals"},pos:[],neg:[],act:[],closed:[]};}
function ventoSul(){const d=blankData("Vento Sul Importação Ltda.");d.meta.accountManager="F. — Trading Desk";d.meta.period="July 2026";d.meta.issued="05 Aug 2026";d.meta.reportNo="VS·ASR·2026-07";d.kpi.activeFoot="▲ 2 vs. Jun";d.kpi.transitFoot="next ETA 19 Aug · Paranaguá";
  d.pos=[
    {id:uid(),code:"PO-2026-0151",ndr:"NDR-2601",product:"Paper cups 8oz DW",qty:"1.15M pcs",value:98900,incoterm:"FOB Qingdao",prod:5,insp:"Pending",inspDate:"",cargoReady:"12 Sep",eta:"18 Oct",port:"Santos",stage:"Confirmed"},
    {id:uid(),code:"PO-2026-0149",ndr:"NDR-2602",product:"Cornstarch clamshells",qty:"2×40′HC",value:71200,incoterm:"FOB Shenzhen",prod:60,insp:"Booked",inspDate:"22 Aug",cargoReady:"30 Aug",eta:"05 Oct",port:"Santos",stage:"In Production"},
    {id:uid(),code:"PO-2026-0148",ndr:"NDR-2603",product:"Bamboo stirrers",qty:"6.0M pcs",value:75000,incoterm:"FOB Ningbo",prod:80,insp:"Booked",inspDate:"18 Aug",cargoReady:"26 Aug",eta:"01 Oct",port:"Paranaguá",stage:"In Production"},
    {id:uid(),code:"PO-2026-0146",ndr:"NDR-2604",product:"Paper straws",qty:"3.2M pcs",value:41600,incoterm:"FOB Ningbo",prod:100,insp:"Booked",inspDate:"08 Aug",cargoReady:"15 Aug",eta:"20 Sep",port:"Santos",stage:"Inspection"},
    {id:uid(),code:"PO-2026-0145",ndr:"NDR-2605",product:"Kraft food boxes",qty:"2×40′HC",value:88400,incoterm:"FOB Qingdao",prod:100,insp:"Passed",inspDate:"",cargoReady:"Ready 06 Aug",eta:"12 Sep",port:"Itajaí",stage:"Cargo Ready"},
    {id:uid(),code:"PO-2026-0144",ndr:"NDR-2606",product:"Sugarcane bowls",qty:"1×40′HC",value:46700,incoterm:"FOB Qingdao",prod:100,insp:"Passed",inspDate:"",cargoReady:"Booked 05 Aug",eta:"10 Sep",port:"Santos",stage:"Booked"},
    {id:uid(),code:"PO-2026-0143",ndr:"NDR-2607",product:"PLA cutlery sets",qty:"1×40′HC",value:52300,incoterm:"FOB Shenzhen",prod:100,insp:"Passed",inspDate:"",cargoReady:"Loaded 02 Aug",eta:"08 Sep",port:"Santos",stage:"Loaded"},
    {id:uid(),code:"PO-2026-0141",ndr:"NDR-2608",product:"Paper cups 12oz",qty:"0.90M pcs",value:79200,incoterm:"CIF Santos",prod:100,insp:"Passed",inspDate:"",cargoReady:"ETD 19 Jul",eta:"24 Aug",port:"Santos",stage:"In Transit"},
    {id:uid(),code:"PO-2026-0140",ndr:"NDR-2609",product:"Bagasse plates",qty:"30 CBM",value:63700,incoterm:"FOB Qingdao",prod:100,insp:"Passed",inspDate:"",cargoReady:"ETD 14 Jul",eta:"19 Aug",port:"Paranaguá",stage:"In Transit"}
  ];
  d.neg=[
    {id:uid(),ref:"NEG-04",topic:"Kraft mailer boxes — new SKU",next:"send FOB quote",owner:"Desk",due:"08 Aug",value:120000,stage:"Inquiry",outcome:"Open",samples:"Pending"},
    {id:uid(),ref:"NEG-03",topic:"Cornstarch cutlery — volume tier",next:"align target price",owner:"Client",due:"11 Aug",value:260000,stage:"Proposal",outcome:"Open",samples:"Approved"},
    {id:uid(),ref:"NEG-02",topic:"Bamboo stirrers — H2 re-price",next:"counter w/ 2 factories",owner:"Desk",due:"07 Aug",value:150000,stage:"Proposal",outcome:"Open",samples:"Delivered"},
    {id:uid(),ref:"NEG-01",topic:"Annual paper-cup framework",next:"draft agreement",owner:"Desk",due:"14 Aug",value:520000,stage:"Proposal",outcome:"Open",samples:"Approved"},
    {id:uid(),ref:"NEG-99",topic:"Sugarcane trays — spot deal",next:"— converted to PO-0144",owner:"Desk",due:"—",value:46700,stage:"Proposal",outcome:"Won",samples:"Approved",wonPo:"seeded"},
    {id:uid(),ref:"NEG-98",topic:"Wooden forks — bulk trial",next:"— price not competitive",owner:"Desk",due:"—",value:60000,stage:"Inquiry",outcome:"Lost",samples:"Rejected"}
  ];
  d.act=[
    {id:uid(),type:"red",text:"PO-0146 — QC window is tight. Confirm inspection booking by 08 Aug to protect 15 Aug cargo-ready date.",owner:"Trading Desk"},
    {id:uid(),type:"client",text:"PO-0145 — cargo ready 06 Aug. Awaiting booking confirmation & shipping instructions from client.",owner:"Client"},
    {id:uid(),type:"blue",text:"PO-0143 — loaded 02 Aug; vessel booked, ETD confirmed 08 Sep to Santos.",owner:"Trading Desk"},
    {id:uid(),type:"gold",text:"PO-0151 — deposit received 01 Aug; production start pending material colour approval.",owner:"Factory / Client"},
    {id:uid(),type:"grn",text:"NEG-01 — client requested payment-terms review (30/70 → LC at sight) before signing.",owner:"Trading Desk"}
  ];
  d.closed=[
    {id:uid(),code:"PO-2026-0138",ndr:"NDR-2588",product:"Bagasse bowls",value:58900,delivered:"28 Jul",port:"Santos"},
    {id:uid(),code:"PO-2026-0135",ndr:"NDR-2585",product:"Paper cups 16oz",value:84300,delivered:"15 Jul",port:"Itajaí"}
  ];return d;}
function andes(){const d=blankData("Andes Importações S.A.");d.meta.period="July 2026";d.meta.issued="05 Aug 2026";d.meta.reportNo="AND·ASR·2026-07";d.meta.tradeLane="China → Chile (CL)";
  d.pos=[
    {id:uid(),code:"PO-2026-0207",ndr:"NDR-2610",product:"PET clamshells",qty:"2×40′HC",value:64800,incoterm:"FOB Ningbo",prod:35,insp:"Pending",inspDate:"",cargoReady:"20 Sep",eta:"28 Oct",port:"San Antonio",stage:"In Production"},
    {id:uid(),code:"PO-2026-0205",ndr:"NDR-2611",product:"Aluminium foil trays",qty:"1×40′HC",value:47500,incoterm:"FOB Qingdao",prod:100,insp:"Passed",inspDate:"",cargoReady:"Loaded 03 Aug",eta:"09 Sep",port:"San Antonio",stage:"Loaded"}
  ];
  d.neg=[{id:uid(),ref:"NEG-11",topic:"Compostable cups — trial order",next:"send samples",owner:"Desk",due:"12 Aug",value:90000,stage:"Inquiry",outcome:"Open",samples:"Requested"}];
  d.closed=[{id:uid(),code:"PO-2026-0198",ndr:"NDR-2580",product:"Kraft bags",value:39900,delivered:"22 Jul",port:"Valparaíso"}];return d;}
function seedStore(){const c1={id:uid(),data:ventoSul()},c2={id:uid(),data:andes()};return {activeClientId:c1.id,clients:[c1,c2],logo:null,settings:{deliveredMode:"Hidden"}};}

let store=seedStore(),data;
function useActive(){const c=store.clients.find(c=>c.id===store.activeClientId)||store.clients[0];store.activeClientId=c.id;data=c.data;}
async function save(){try{if(window.storage&&window.storage.set)await window.storage.set(KEY,JSON.stringify(store));}catch(e){}const t=document.getElementById("savedTag");t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1100);}
async function load(){try{if(window.storage&&window.storage.get){const r=await window.storage.get(KEY);if(r&&r.value)return JSON.parse(r.value);}}catch(e){}return null;}
function normalize(d){d.meta=d.meta||{};d.kpi=d.kpi||{};["pos","neg","act","closed"].forEach(k=>d[k]=d[k]||[]);
  d.pos.forEach(p=>{if(p.insp===undefined){const q=p.qc||"pending";p.insp=q==="passed"?"Passed":q==="pending"?"Pending":"Booked";p.inspDate=(p.insp==="Booked"&&p.qcLabel)?String(p.qcLabel).replace(/^[A-Za-z ]*/,"").trim():"";}if(p.inspDate===undefined)p.inspDate="";if(p.ndr===undefined)p.ndr="";if(p.stage==="Booked/Loaded")p.stage="Loaded";if(p.stage==="Delivered / Closed")p.stage="Arrived";delete p.qc;delete p.qcLabel;});
  d.neg.forEach(n=>{if(n.outcome===undefined)n.outcome="Open";if(n.samples===undefined)n.samples="N/A";if(n.stage==="Quotation")n.stage="Inquiry";if(n.stage==="Negotiation")n.stage="Proposal";});
  d.closed.forEach(c=>{if(c.value==null)c.value=0;if(c.ndr===undefined)c.ndr="";});return d;}
function migrateStore(obj){if(obj&&Array.isArray(obj.clients)){if(obj.logo===undefined)obj.logo=null;if(!obj.settings)obj.settings={deliveredMode:"Hidden"};if(!obj.settings.deliveredMode)obj.settings.deliveredMode="Hidden";obj.clients.forEach(c=>{c.id=c.id||uid();normalize(c.data);});if(!obj.clients.find(c=>c.id===obj.activeClientId))obj.activeClientId=obj.clients[0].id;return obj;}
  if(obj&&Array.isArray(obj.pos))return {activeClientId:"m",clients:[{id:"m",data:normalize(obj)}],logo:null,settings:{deliveredMode:"Hidden"}};return null;}

function esc(s){return (s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function money(v){v=Number(v)||0;return v>=1e6?(v/1e6).toFixed(2)+"M":(v/1e3).toFixed(1)+"K";}
function boldCodes(s){return esc(s).replace(/\b(PO-\d{4}(?:-\d{4})?|NEG-\d+|NDR-\d+)\b/g,"<b>$1</b>");}
function shortCode(c){if(!c)return "NEW";const m=String(c).match(/(\d{4})\s*$/);return m?"PO-"+m[1]:esc(c);}
function pillClass(st){return {"Confirmed":"p-conf","In Production":"p-prod","Inspection":"p-insp","Cargo Ready":"p-ready","Booked":"p-book","Loaded":"p-load","In Transit":"p-transit","Arrived":"p-ready"}[st]||"p-conf";}
function stageStop(st){return {"Confirmed":"PO Confirmed","In Production":"Production","Inspection":"Inspection","Cargo Ready":"Cargo Ready","Booked":"Booked","Loaded":"Loaded","In Transit":"In Transit","Arrived":"Arrived"}[st];}
function negStop(st){return st;}
function chipCls(st){if(["Cargo Ready","Booked","Loaded","In Transit","Arrived"].includes(st))return"b";if(["In Production","Inspection"].includes(st))return"g";return"";}
function inspCell(p){const map={Pending:["na","Pending"],Booked:["due","Booked"+(p.inspDate?" "+p.inspDate:"")],Concluded:["due","Concluded"],Passed:["pass","Passed"]};const x=map[p.insp]||map.Pending;return `<span class="qc ${x[0]}"><span class="d"></span>${esc(x[1])}</span>`;}
function sampleTag(s){const m={"N/A":["smp-na","N/A"],"Requested":["smp-req","Requested"],"Pending":["smp-pend","Pending"],"Delivered":["smp-deliv","Delivered"],"Approved":["smp-appr","Approved"],"Rejected":["smp-rej","Rejected"]};const x=m[s]||m["N/A"];return '<span class="smp '+x[0]+'">'+x[1]+'</span>';}
function codeOf(name){const w=(name||"").replace(/[^A-Za-z ]/g,"").trim().split(/\s+/);let c=(w[0]?w[0][0]:"")+(w[1]?w[1][0]:(w[0]&&w[0][1]?w[0][1]:""));return (c||"C").toUpperCase();}
function count(stage){return data.pos.filter(p=>p.stage===stage).length;}
function sumStage(stage){return data.pos.filter(p=>p.stage===stage).reduce((a,p)=>a+(Number(p.value)||0),0);}

function renderReport(){if(reportMode==="all"){renderConsolidated();return;}
  const m=data.meta,k=data.kpi;
  const openNegs=data.neg.filter(n=>n.outcome==="Open");
  const openVal=data.pos.reduce((a,p)=>a+(Number(p.value)||0),0);
  const negVal=openNegs.reduce((a,n)=>a+(Number(n.value)||0),0);
  const closedVal=data.closed.reduce((a,c)=>a+(Number(c.value)||0),0);
  const dmode=(store.settings&&store.settings.deliveredMode)||"Hidden";
  const buckets={};STOPS.forEach(s=>buckets[s]=[]);
  openNegs.forEach(n=>{const s=negStop(n.stage);if(buckets[s])buckets[s].push({t:n.ref,c:"g"});});
  data.pos.forEach(p=>{const s=stageStop(p.stage);if(buckets[s])buckets[s].push({t:shortCode(p.code),c:chipCls(p.stage)});});
  if(dmode==="Listed")data.closed.forEach(c=>buckets["Delivered"].push({t:shortCode(c.code),c:"n"}));
  else if(dmode==="Count"&&data.closed.length)buckets["Delivered"].push({t:data.closed.length+" closed",c:"n"});
  let lastIdx=0;STOPS.forEach((s,i)=>{if(buckets[s].length)lastIdx=i;});
  const inProd=new Set(data.pos.filter(p=>p.stage==="In Production").map(p=>stageStop(p.stage)));
  const stopsHtml=STOPS.map((s,i)=>{const reached=i<=lastIdx,active=inProd.has(s);const chips=buckets[s].map(ch=>`<span class="chip ${ch.c}">${esc(ch.t)}</span>`).join("");
    return `<div class="stop ${active?"active ":""}${reached?"reached":""}"><div class="dot"></div><div class="s-lab">${esc(s)}</div><div class="chips">${chips}</div></div>`;}).join("");
  const kpi=(cls,label,val,foot)=>`<div class="kpi ${cls}"><div class="k-label">${label}</div><div class="k-val tabnum">${val}</div><div class="k-foot">${foot}</div></div>`;
  const kpisHtml=[
    kpi("","In Negotiation",`<small>US$</small> ${money(negVal)}`,`${openNegs.length} open topics`),
    kpi("nav","Active POs",`${data.pos.length}`,boldCodes(k.activeFoot||"")),
    kpi("","Open Order Value",`<small>US$</small> ${money(openVal)}`,`across ${data.pos.length} POs`),
    kpi("nav","In Production",`${count("In Production")}`,`US$ ${money(sumStage("In Production"))}`),
    kpi("nav","Cargo Ready",`${count("Cargo Ready")}`,`US$ ${money(sumStage("Cargo Ready"))}`),
    kpi("","In Transit",`${count("In Transit")}`,esc(k.transitFoot||"")),
    kpi("grn","Delivered POs",`${data.closed.length}`,""),
    kpi("grn","Closed Order Value",`<small>US$</small> ${money(closedVal)}`,`realised revenue`)
  ].join("");
  const opsRows=data.pos.map(p=>`<tr>
    <td class="po">${p.code?esc(p.code):'<span class="addpo">add PO#</span>'}</td><td class="ndr">${esc(p.ndr||"—")}</td>
    <td class="prod">${esc(p.product)}</td><td class="num">${esc(p.qty)}</td><td class="val">${(Number(p.value)||0).toLocaleString("en-US")}</td>
    <td class="ic">${esc(p.incoterm)}</td>
    <td><span class="bar"><i style="width:${Math.max(0,Math.min(100,Number(p.prod)||0))}%"></i></span><span class="barlab">${Number(p.prod)||0}%</span></td>
    <td class="ic">${esc(p.cargoReady)}</td><td>${inspCell(p)}</td><td class="ic">${esc(p.eta)} · ${esc(p.port)}</td>
    <td><span class="pill ${pillClass(p.stage)}">${esc(p.stage)}</span></td></tr>`).join("");
  const negRows=openNegs.map(n=>{const sc={Proposal:"st-p",Inquiry:"st-i"}[n.stage]||"st-i";
    return `<tr><td class="ref">${esc(n.ref)}</td><td class="topic">${esc(n.topic)}</td><td>${sampleTag(n.samples)}</td><td class="nextcol">${esc(n.next)}</td><td class="ic">${esc(n.owner)}</td><td class="ic">${esc(n.due)}</td><td class="val">${money(n.value)}</td><td><span class="stage-tag ${sc}">${esc(n.stage)}</span></td></tr>`;}).join("");
  const actRows=data.act.map(a=>`<div class="act-row"><div class="tag t-${a.type}">${ACT_SYM[a.type]||"◆"}</div><div>${boldCodes(a.text)} <span class="who">Owner: ${esc(a.owner)}</span></div></div>`).join("");
  const actLegend=ACT_TYPES.map(t=>`<span class="l"><i class="t-${t[0]}"></i> ${t[1]}</span>`).join("");
  const markHtml=store.logo?`<div class="mark haslogo"><img src="${store.logo}" alt="logo"></div>`:`<div class="mark"><span>${esc(m.company)}</span></div>`;
  document.getElementById("reportRoot").innerHTML=`
  <div class="sheet">
    <header class="r-masthead"><div class="brand">${markHtml}<div class="brand-txt"><div class="eyebrow">Client Account Intelligence</div><h2>${esc(m.title)}</h2><div class="sub">Commercial &amp; operational tracking</div></div></div>
      <dl class="meta"><dt>Client</dt><dd>${esc(m.client)}</dd><dt>Account Manager</dt><dd>${esc(m.accountManager)}</dd><dt>Reporting Period</dt><dd>${esc(m.period)}</dd><dt>Issued</dt><dd class="accent">${esc(m.issued)}</dd><dt>Report No.</dt><dd class="mono">${esc(m.reportNo)}</dd><dt>Trade Lane</dt><dd>${esc(m.tradeLane)}</dd></dl></header>
    <section class="kpis">${kpisHtml}</section>
    <div class="sec-h"><span class="n">01</span><h3>Deal Journey — Live Position</h3><span class="rule"></span><span class="aside">Each reference plotted at its current lifecycle stage</span></div>
    <section class="journey"><div class="stops" style="grid-template-columns:repeat(${STOPS.length},1fr)">${stopsHtml}</div><div class="journey-legend"><span class="lg"><i style="background:#D9B24A"></i> Commercial / factory</span><span class="lg"><i style="background:#3C5C7A"></i> Logistics</span><span class="lg"><i style="background:#2E7D57"></i> Closed</span></div></section>
    <div class="sec-h"><span class="n">02</span><h3>Confirmed Orders &amp; Operations</h3><span class="rule"></span><span class="aside">${data.pos.length} active · US$ ${money(openVal)}</span></div>
    <table class="ops"><thead><tr><th>Client PO</th><th>NDR ref</th><th>Product</th><th class="num">Qty / Vol</th><th class="num">Value US$</th><th>Incoterm</th><th>Production</th><th>Cargo Ready</th><th>Inspection</th><th>ETA (Port)</th><th>Status</th></tr></thead><tbody>${opsRows||`<tr><td colspan="11" class="ic" style="padding:12px;text-align:center">No active purchase orders</td></tr>`}</tbody></table>
    <div class="sec-h"><span class="n">03</span><h3>Commercial Pipeline</h3><span class="rule"></span><span class="aside">${openNegs.length} open · US$ ${money(negVal)}</span></div>
    <table class="neg"><thead><tr><th>Ref</th><th>Topic / Product</th><th>Samples</th><th>Next action</th><th>Owner</th><th>Due</th><th class="num">Est. US$</th><th>Stage</th></tr></thead><tbody>${negRows||`<tr><td colspan="8" class="ic" style="padding:10px;text-align:center">No open topics</td></tr>`}</tbody></table>
    <div class="sec-h"><span class="n">04</span><h3>Action Items &amp; Alerts</h3><span class="rule"></span></div>
    <div class="actblock"><div class="mini-title">Open items <span class="cnt">${data.act.length} open</span></div><div class="act-legend">${actLegend}</div><div class="actions">${actRows||`<div class="act-row"><div>No open actions.</div></div>`}</div></div>
    <footer class="r-foot"><div class="conf">Confidential — prepared exclusively for ${esc(m.client)}</div><div class="who">Prepared by <b>${esc(m.preparedBy)}</b> · ${esc(m.contact)}</div></footer>
  </div>`;
  fitReport();
}

function renderConsolidated(){
  const cs=store.clients.map((c,i)=>({id:c.id,name:c.data.meta.client,code:codeOf(c.data.meta.client),color:PALETTE[i%PALETTE.length],d:c.data}));
  let POS=[],NEG=[],ACT=[];
  cs.forEach(c=>{c.d.pos.forEach(p=>POS.push([p,c]));c.d.neg.filter(n=>n.outcome==="Open").forEach(n=>NEG.push([n,c]));c.d.act.forEach(a=>ACT.push([a,c]));});
  const openVal=POS.reduce((a,x)=>a+(+x[0].value||0),0);
  const negVal=NEG.reduce((a,x)=>a+(+x[0].value||0),0);
  const closedVal=cs.reduce((a,c)=>a+c.d.closed.reduce((s,x)=>s+(+x.value||0),0),0);
  const closedCount=cs.reduce((a,c)=>a+c.d.closed.length,0);
  const cnt=st=>POS.filter(x=>x[0].stage===st).length;
  const sumSt=st=>POS.filter(x=>x[0].stage===st).reduce((a,x)=>a+(+x[0].value||0),0);
  const dmode=(store.settings&&store.settings.deliveredMode)||"Hidden";
  const buckets={};STOPS.forEach(s=>buckets[s]=[]);
  NEG.forEach(x=>{const s=negStop(x[0].stage);if(buckets[s])buckets[s].push({t:x[0].ref,col:x[1].color});});
  POS.forEach(x=>{const s=stageStop(x[0].stage);if(buckets[s])buckets[s].push({t:shortCode(x[0].code),col:x[1].color});});
  if(dmode==="Count"&&closedCount)buckets["Delivered"].push({t:closedCount+" closed",col:"#2E7D57"});
  else if(dmode==="Listed")cs.forEach(c=>c.d.closed.forEach(z=>buckets["Delivered"].push({t:shortCode(z.code),col:c.color})));
  let lastIdx=0;STOPS.forEach((s,i)=>{if(buckets[s].length)lastIdx=i;});
  const inProd=new Set(POS.filter(x=>x[0].stage==="In Production").map(x=>stageStop(x[0].stage)));
  const stopsHtml=STOPS.map((s,i)=>{const reached=i<=lastIdx,active=inProd.has(s);const chips=buckets[s].map(ch=>`<span class="chip" style="border-color:${ch.col}"><i style="background:${ch.col}"></i>${esc(ch.t)}</span>`).join("");
    return `<div class="stop ${active?"active ":""}${reached?"reached":""}"><div class="dot"></div><div class="s-lab">${esc(s)}</div><div class="chips">${chips}</div></div>`;}).join("");
  const kpi=(cls,label,val,foot)=>`<div class="kpi ${cls}"><div class="k-label">${label}</div><div class="k-val tabnum">${val}</div><div class="k-foot">${foot}</div></div>`;
  const kpisHtml=[
    kpi("","In Negotiation",`<small>US$</small> ${money(negVal)}`,`${NEG.length} open topics`),
    kpi("nav","Active POs",`${POS.length}`,`${cs.length} clients`),
    kpi("","Open Order Value",`<small>US$</small> ${money(openVal)}`,`portfolio order book`),
    kpi("nav","In Production",`${cnt("In Production")}`,`US$ ${money(sumSt("In Production"))}`),
    kpi("nav","Cargo Ready",`${cnt("Cargo Ready")}`,`US$ ${money(sumSt("Cargo Ready"))}`),
    kpi("","In Transit",`${cnt("In Transit")}`,`shipments moving`),
    kpi("grn","Delivered POs",`${closedCount}`,""),
    kpi("grn","Closed Order Value",`<small>US$</small> ${money(closedVal)}`,`realised revenue`)
  ].join("");
  const roster=cs.map(c=>`<span class="r"><i style="background:${c.color}"></i><b>${esc(c.code)}</b> ${esc(c.name)}</span>`).join("");
  const opsRows=POS.map(x=>{const p=x[0],c=x[1];return `<tr>
    <td><span class="ccode" style="background:${c.color}">${esc(c.code)}</span></td>
    <td class="po">${p.code?esc(p.code):'<span class="addpo">add PO#</span>'}</td><td class="ndr">${esc(p.ndr||"—")}</td>
    <td class="prod">${esc(p.product)}</td><td class="num">${esc(p.qty)}</td><td class="val">${(+p.value||0).toLocaleString("en-US")}</td>
    <td class="ic">${esc(p.incoterm)}</td><td class="ic">${esc(p.cargoReady)}</td><td>${inspCell(p)}</td>
    <td class="ic">${esc(p.eta)}${p.port?" · "+esc(p.port):""}</td><td><span class="pill ${pillClass(p.stage)}">${esc(p.stage)}</span></td></tr>`;}).join("");
  const negRows=NEG.map(x=>{const n=x[0],c=x[1];const sc={Proposal:"st-p",Inquiry:"st-i"}[n.stage]||"st-i";
    return `<tr><td><span class="ccode" style="background:${c.color}">${esc(c.code)}</span></td><td class="ref">${esc(n.ref)}</td><td class="topic">${esc(n.topic)}</td><td>${sampleTag(n.samples)}</td><td class="ic">${esc(n.owner)}</td><td class="ic">${esc(n.due)}</td><td class="val">${money(n.value)}</td><td><span class="stage-tag ${sc}">${esc(n.stage)}</span></td></tr>`;}).join("");
  const actRows=ACT.map(x=>{const a=x[0],c=x[1];return `<div class="act-row"><div class="tag t-${a.type}">${ACT_SYM[a.type]||"◆"}</div><div><span class="ccode" style="background:${c.color};margin-right:5px">${esc(c.code)}</span>${boldCodes(a.text)} <span class="who">Owner: ${esc(a.owner)}</span></div></div>`;}).join("");
  const actLegend=ACT_TYPES.map(t=>`<span class="l"><i class="t-${t[0]}"></i> ${t[1]}</span>`).join("");
  const fc=cs.map(c=>{const realised=c.d.closed.reduce((a,z)=>a+(+z.value||0),0);const orderbook=c.d.pos.reduce((a,p)=>a+(+p.value||0),0);const weighted=c.d.neg.filter(n=>n.outcome==="Open").reduce((a,n)=>a+(+n.value||0)*(PROB[n.stage]||0),0);return {c,realised,orderbook,weighted,proj:realised+orderbook+weighted};});
  const tR=fc.reduce((a,r)=>a+r.realised,0),tO=fc.reduce((a,r)=>a+r.orderbook,0),tW=fc.reduce((a,r)=>a+r.weighted,0),tP=tR+tO+tW;
  const rnd=v=>Math.round(v).toLocaleString("en-US");
  const fcRows=fc.map(r=>`<tr><td><span class="ccode" style="background:${r.c.color}">${esc(r.c.code)}</span> ${esc(r.c.name)}</td><td class="val">${rnd(r.realised)}</td><td class="val">${rnd(r.orderbook)}</td><td class="val">${rnd(r.weighted)}</td><td class="val">${rnd(r.proj)}</td></tr>`).join("")
    +`<tr style="background:#FBF3DE"><td class="prod">Portfolio total</td><td class="val">${rnd(tR)}</td><td class="val">${rnd(tO)}</td><td class="val">${rnd(tW)}</td><td class="val">${rnd(tP)}</td></tr>`;
  const today=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
  const markHtml=store.logo?`<div class="mark haslogo"><img src="${store.logo}" alt="logo"></div>`:`<div class="mark"><span>YOUR LOGO</span></div>`;
  document.getElementById("reportRoot").innerHTML=`
  <div class="sheet">
    <header class="r-masthead"><div class="brand">${markHtml}<div class="brand-txt"><div class="eyebrow">Portfolio Intelligence</div><h2>Consolidated Business Overview</h2><div class="sub">All clients — commercial &amp; operational tracking</div></div></div>
      <dl class="meta"><dt>Scope</dt><dd>All clients (${cs.length})</dd><dt>Account Manager</dt><dd>Trading Desk</dd><dt>Snapshot</dt><dd class="accent">${today}</dd><dt>Report No.</dt><dd class="mono">PORTFOLIO</dd><dt>Trade Lanes</dt><dd>China → LATAM</dd></dl></header>
    <section class="kpis">${kpisHtml}</section>
    <div class="roster"><span class="rlab">Clients included</span>${roster}</div>
    <div class="sec-h"><span class="n">01</span><h3>Deal Journey — All Clients</h3><span class="rule"></span><span class="aside">Every live reference across the portfolio · dot colour = client</span></div>
    <section class="journey"><div class="stops" style="grid-template-columns:repeat(${STOPS.length},1fr)">${stopsHtml}</div><div class="journey-legend"><span class="lg"><i style="background:#D9B24A"></i> Commercial / factory</span><span class="lg"><i style="background:#3C5C7A"></i> Logistics</span><span class="lg"><i style="background:#2E7D57"></i> Closed</span></div></section>
    <div class="sec-h"><span class="n">02</span><h3>Confirmed Orders &amp; Operations — All Clients</h3><span class="rule"></span><span class="aside">${POS.length} active · US$ ${money(openVal)}</span></div>
    <table class="ops"><thead><tr><th>Client</th><th>Client PO</th><th>NDR ref</th><th>Product</th><th class="num">Qty / Vol</th><th class="num">Value US$</th><th>Incoterm</th><th>Cargo Ready</th><th>Inspection</th><th>ETA (Port)</th><th>Status</th></tr></thead><tbody>${opsRows||`<tr><td colspan="11" class="ic" style="padding:12px;text-align:center">No active orders</td></tr>`}</tbody></table>
    <div class="sec-h"><span class="n">03</span><h3>Commercial Pipeline — All Clients</h3><span class="rule"></span><span class="aside">${NEG.length} open · US$ ${money(negVal)}</span></div>
    <table class="neg"><thead><tr><th>Client</th><th>Ref</th><th>Topic / Product</th><th>Samples</th><th>Owner</th><th>Due</th><th class="num">Est. US$</th><th>Stage</th></tr></thead><tbody>${negRows||`<tr><td colspan="8" class="ic" style="padding:10px;text-align:center">No open topics</td></tr>`}</tbody></table>
    <div class="sec-h"><span class="n">04</span><h3>Action Items &amp; Alerts — All Clients</h3><span class="rule"></span></div>
    <div class="actblock"><div class="mini-title">Open items <span class="cnt">${ACT.length} open</span></div><div class="act-legend">${actLegend}</div><div class="actions">${actRows||`<div class="act-row"><div>No open actions.</div></div>`}</div></div>
    <div class="sec-h"><span class="n">05</span><h3>Business Forecast</h3><span class="rule"></span><span class="aside">Projected revenue · US$ ${money(tP)}</span></div>
    <table class="ops"><thead><tr><th>Client</th><th class="num">Realised (closed)</th><th class="num">Order book (active)</th><th class="num">Weighted pipeline</th><th class="num">Projected revenue</th></tr></thead><tbody>${fcRows}</tbody></table>
    <div class="fcnote">Weighted pipeline applies close-probabilities by stage — Inquiry 25% · Proposal 70% (Won deals already sit in the order book). Projected = realised + order book + weighted pipeline. Indicative planning figure, not a commitment.</div>
    <footer class="r-foot"><div class="conf">Confidential — internal business overview · all clients</div><div class="who">Prepared by <b>Trading Desk</b> · ${today}</div></footer>
  </div>`;
  fitReport();
}

function fitReport(){const vp=document.getElementById("reportViewport"),sc=document.getElementById("reportScale"),sheet=sc.querySelector(".sheet");if(!sheet)return;
  const avail=vp.clientWidth-4,W=1122.5,scale=Math.min(1,avail/W);sc.style.transform="scale("+scale+")";const h=sheet.getBoundingClientRect().height;sc.style.height=h+"px";
  const pages=Math.max(1,Math.ceil(h/(793.7*scale)));document.getElementById("pageTag").textContent=pages+(pages>1?" pages":" page");}

function field(entity,id,name,label,val,opts){const v=esc(val==null?"":val);
  if(opts){const o=opts.map(x=>`<option ${x===val?"selected":""}>${esc(x)}</option>`).join("");return `<div class="f"><label>${label}</label><select data-entity="${entity}" data-id="${id}" data-field="${name}">${o}</select></div>`;}
  return `<div class="f"><label>${label}</label><input data-entity="${entity}" data-id="${id}" data-field="${name}" value="${v}"></div>`;}
function area(entity,id,name,label,val){return `<div class="f wide"><label>${label}</label><textarea data-entity="${entity}" data-id="${id}" data-field="${name}">${esc(val||"")}</textarea></div>`;}

function renderManage(){
  document.getElementById("list-pos").innerHTML=data.pos.map((p,i)=>{const dateF=p.insp==="Booked"?field("pos",p.id,"inspDate","Inspection booked date",p.inspDate):"";
    return `<div class="mcard"><div class="ttl"><span class="idx">${i+1}</span><span class="name">${esc(p.code||"Draft PO — add number")}</span><div class="ttl-actions"><button class="deliver" data-deliver="${p.id}">✓ Mark delivered</button><button class="del" data-del="pos" data-id="${p.id}">Delete</button></div></div>
      <div class="grid">${field("pos",p.id,"code","Client PO number",p.code)}${field("pos",p.id,"ndr","NDR ref (Nandera)",p.ndr)}${field("pos",p.id,"product","Product",p.product)}${field("pos",p.id,"qty","Qty / Volume",p.qty)}${field("pos",p.id,"value","Value (US$)",p.value)}${field("pos",p.id,"incoterm","Incoterm",p.incoterm)}${field("pos",p.id,"prod","Production %",p.prod)}${field("pos",p.id,"insp","Inspection status",p.insp,INSP_STATES)}${dateF}${field("pos",p.id,"cargoReady","Cargo ready / ETD",p.cargoReady)}${field("pos",p.id,"eta","ETA",p.eta)}${field("pos",p.id,"port","Destination port",p.port)}${field("pos",p.id,"stage","Stage",p.stage,POS_STAGES)}</div></div>`;}).join("")||`<div class="hint">No purchase orders yet.</div>`;
  document.getElementById("list-neg").innerHTML=data.neg.map((n,i)=>`
    <div class="mcard"><div class="ttl"><span class="idx">${i+1}</span><span class="name">${esc(n.ref||"New topic")}</span><span class="tagoc oc-${n.outcome||"Open"}">${esc(n.outcome||"Open")}</span><button class="del" data-del="neg" data-id="${n.id}">Delete</button></div>
      <div class="grid">${field("neg",n.id,"ref","Reference",n.ref)}${field("neg",n.id,"value","Est. value (US$)",n.value)}${field("neg",n.id,"stage","Stage",n.stage,NEG_STAGES)}${field("neg",n.id,"outcome","Outcome",n.outcome||"Open",NEG_OUTCOMES)}${field("neg",n.id,"samples","Sample status",n.samples||"N/A",NEG_SAMPLES)}${field("neg",n.id,"topic","Topic / product",n.topic)}${field("neg",n.id,"next","Next action",n.next)}${field("neg",n.id,"owner","Owner",n.owner)}${field("neg",n.id,"due","Due",n.due)}</div></div>`).join("")||`<div class="hint">No topics yet.</div>`;
  document.getElementById("list-act").innerHTML=data.act.map((a,i)=>`
    <div class="mcard"><div class="ttl"><span class="idx">${i+1}</span><span class="name">Alert</span><button class="del" data-del="act" data-id="${a.id}">Delete</button></div>
      <div class="grid"><div class="f"><label>Type</label><select data-entity="act" data-id="${a.id}" data-field="type">${ACT_TYPES.map(t=>`<option value="${t[0]}" ${t[0]===a.type?"selected":""}>${t[1]}</option>`).join("")}</select></div>${field("act",a.id,"owner","Owner",a.owner)}${area("act",a.id,"text","Message",a.text)}</div></div>`).join("")||`<div class="hint">No action items.</div>`;
  document.getElementById("list-cl").innerHTML=data.closed.map((c,i)=>`
    <div class="mcard"><div class="ttl"><span class="idx">${i+1}</span><span class="name">${esc(c.code||"Closed")}</span><button class="del" data-del="closed" data-id="${c.id}">Delete</button></div>
      <div class="grid">${field("closed",c.id,"code","Client PO number",c.code)}${field("closed",c.id,"ndr","NDR ref (Nandera)",c.ndr)}${field("closed",c.id,"product","Product",c.product)}${field("closed",c.id,"value","Value (US$)",c.value)}${field("closed",c.id,"delivered","Delivered",c.delivered)}${field("closed",c.id,"port","Port",c.port)}</div></div>`).join("")||`<div class="hint">Nothing closed yet.</div>`;
  renderSettings();renderOverview();
  document.getElementById("b-pos").textContent=data.pos.length;document.getElementById("b-neg").textContent=data.neg.length;
  document.getElementById("b-act").textContent=data.act.length;document.getElementById("b-cl").textContent=data.closed.length;
  document.getElementById("c-pos").textContent=data.pos.length+" order(s)";document.getElementById("c-neg").textContent=data.neg.length+" topic(s)";
  document.getElementById("c-act").textContent=data.act.length+" item(s)";document.getElementById("c-cl").textContent=data.closed.length+" deal(s)";
}
function renderSettings(){const m=data.meta,k=data.kpi;const dm=(store.settings&&store.settings.deliveredMode)||"Hidden";
  const logoPrev=store.logo?`<img src="${store.logo}" alt="logo">`:`<div class="ph">No logo yet</div>`;
  document.getElementById("list-settings").innerHTML=`
    <div class="mcard"><div class="ttl"><span class="idx">§</span><span class="name">Report header</span></div>
      <div class="grid">${field("meta","_","company","Logo caption (used if no image)",m.company)}${field("meta","_","title","Report title",m.title)}${field("meta","_","client","Client",m.client)}${field("meta","_","accountManager","Account manager",m.accountManager)}${field("meta","_","period","Reporting period",m.period)}${field("meta","_","issued","Issued date",m.issued)}${field("meta","_","reportNo","Report no.",m.reportNo)}${field("meta","_","tradeLane","Trade lane",m.tradeLane)}${field("meta","_","preparedBy","Prepared by",m.preparedBy)}${field("meta","_","contact","Contact",m.contact)}</div>
      <div class="hint">Renaming the Client here also renames it in the client switcher.</div></div>
    <div class="mcard"><div class="ttl"><span class="idx">◆</span><span class="name">Logo image <span style="font-weight:400;color:var(--muted);font-size:11px">(applies to all clients &amp; the consolidated report)</span></span></div>
      <div class="logobox"><div class="logopreview">${logoPrev}</div><div><button class="add-btn" data-action="logo-upload" style="padding:9px 16px;width:auto">↥ Upload logo image</button>${store.logo?`<button class="add-btn" data-action="logo-remove" style="padding:9px 16px;width:auto;margin-top:8px;border-color:#e6c9c4;color:var(--act)">Remove logo</button>`:""}<div class="hint">PNG/JPG. Auto-resized and framed inside the header mark.</div></div></div></div>
    <div class="mcard"><div class="ttl"><span class="idx">↦</span><span class="name">Deal Journey — delivered deals <span style="font-weight:400;color:var(--muted);font-size:11px">(applies to all clients)</span></span></div>
      <div class="grid"><div class="f"><label>Show delivered POs on the journey</label><select data-entity="opt" data-id="_" data-field="deliveredMode">${DELIVERED_MODES.map(x=>`<option ${x===dm?"selected":""}>${x}</option>`).join("")}</select></div></div>
      <div class="hint"><b>Hidden</b> — delivered deals drop off the journey. <b>Count</b> — a single "N closed" tag. <b>Listed</b> — every delivered PO plotted.</div></div>
    <div class="mcard"><div class="ttl"><span class="idx">%</span><span class="name">KPI footnotes</span></div>
      <div class="grid">${field("kpi","_","activeFoot","Active POs — footnote",k.activeFoot)}${field("kpi","_","transitFoot","In Transit — footnote",k.transitFoot)}</div></div>
    <div class="mcard"><div class="ttl"><span class="idx">⟲</span><span class="name">Data</span></div>
      <div class="grid"><div class="f"><label>&nbsp;</label><button class="add-btn" data-action="export" style="padding:9px">↧ Backup (download JSON)</button></div><div class="f"><label>&nbsp;</label><button class="add-btn" data-action="import" style="padding:9px">↥ Import (restore JSON)</button></div><div class="f"><label>&nbsp;</label><button class="add-btn" data-action="reset" style="padding:9px;border-color:#e6c9c4;color:var(--act)">↺ Reset to sample data</button></div></div>
      <div class="datalegend"><h4>How to manage your data — the three buttons</h4>
        <div class="dlrow"><span class="dlk b1">↧ Backup</span><div><b>Saves everything to one file.</b> Downloads a single JSON with <b>all clients</b> — your master register. Keep it in your drive and back up after each session.</div></div>
        <div class="dlrow"><span class="dlk b2">↥ Import</span><div><b>Loads a backup file back in.</b> <b>Replaces</b> everything in the tool. Use it to restore, or to move to another device or browser.</div></div>
        <div class="dlrow"><span class="dlk b3">↺ Reset</span><div><b>Wipes everything and reloads the sample</b> — <b>back up first</b>, current entries can't be recovered.</div></div>
      </div></div>`;
}
function renderOverview(){
  const sel=(ent,id,f,opts,cur)=>`<select class="mini" data-entity="${ent}" data-id="${id}" data-field="${f}">${opts.map(x=>`<option ${x===cur?"selected":""}>${esc(x)}</option>`).join("")}</select>`;
  const inp=(ent,id,f,v)=>`<input class="mini" data-entity="${ent}" data-id="${id}" data-field="${f}" value="${esc(v==null?"":v)}">`;
  let oh=`<table class="mtable"><thead><tr><th>Client</th><th>Client PO</th><th>NDR ref</th><th>Product</th><th>Value US$</th><th>Prod %</th><th>Inspection</th><th>Insp. date</th><th>Cargo ready</th><th>ETA</th><th>Stage</th></tr></thead><tbody>`;
  store.clients.forEach(c=>{oh+=`<tr class="grouprow"><td colspan="11">${esc(c.data.meta.client)}</td></tr>`;if(!c.data.pos.length)oh+=`<tr><td colspan="11" class="ovempty">No orders</td></tr>`;
    c.data.pos.forEach(p=>{oh+=`<tr><td class="ovcli">${esc(c.data.meta.client)}</td><td>${inp("pos",p.id,"code",p.code)}</td><td>${inp("pos",p.id,"ndr",p.ndr)}</td><td>${inp("pos",p.id,"product",p.product)}</td><td>${inp("pos",p.id,"value",p.value)}</td><td>${inp("pos",p.id,"prod",p.prod)}</td><td>${sel("pos",p.id,"insp",INSP_STATES,p.insp)}</td><td>${inp("pos",p.id,"inspDate",p.inspDate)}</td><td>${inp("pos",p.id,"cargoReady",p.cargoReady)}</td><td>${inp("pos",p.id,"eta",p.eta)}</td><td>${sel("pos",p.id,"stage",POS_STAGES,p.stage)}</td></tr>`;});});
  oh+=`</tbody></table>`;document.getElementById("ov-orders").innerHTML=oh;
  let ph=`<table class="mtable" style="min-width:1020px"><thead><tr><th>Client</th><th>Ref</th><th>Topic</th><th>Value US$</th><th>Stage</th><th>Outcome</th><th>Samples</th><th>Next action</th><th>Due</th></tr></thead><tbody>`;
  store.clients.forEach(c=>{ph+=`<tr class="grouprow"><td colspan="9">${esc(c.data.meta.client)}</td></tr>`;if(!c.data.neg.length)ph+=`<tr><td colspan="9" class="ovempty">No topics</td></tr>`;
    c.data.neg.forEach(n=>{ph+=`<tr><td class="ovcli">${esc(c.data.meta.client)}</td><td>${inp("neg",n.id,"ref",n.ref)}</td><td>${inp("neg",n.id,"topic",n.topic)}</td><td>${inp("neg",n.id,"value",n.value)}</td><td>${sel("neg",n.id,"stage",NEG_STAGES,n.stage)}</td><td>${sel("neg",n.id,"outcome",NEG_OUTCOMES,n.outcome||"Open")}</td><td>${sel("neg",n.id,"samples",NEG_SAMPLES,n.samples||"N/A")}</td><td>${inp("neg",n.id,"next",n.next)}</td><td>${inp("neg",n.id,"due",n.due)}</td></tr>`;});});
  ph+=`</tbody></table>`;document.getElementById("ov-pipeline").innerHTML=ph;
}
function renderClientSelect(){document.getElementById("clientSelect").innerHTML=store.clients.map(c=>`<option value="${c.id}" ${c.id===store.activeClientId?"selected":""}>${esc(c.data.meta.client||"Untitled")}</option>`).join("");}
function renderAll(){useActive();renderClientSelect();renderReport();renderManage();}

function makeDraftPO(neg){return {id:uid(),code:"",ndr:"",product:neg.topic||"Won deal",qty:"",value:Number(neg.value)||0,incoterm:"",prod:0,insp:"Pending",inspDate:"",cargoReady:"",eta:"",port:"",stage:"Confirmed"};}
function setField(entity,id,f,v){
  if(entity==="meta"){data.meta[f]=v;if(f==="client")renderClientSelect();return;}
  if(entity==="kpi"){data.kpi[f]=v;return;}
  if(entity==="opt"){store.settings=store.settings||{};store.settings[f]=v;return;}
  for(const c of store.clients){const L=c.data[entity];if(L){const it=L.find(x=>x.id===id);if(it){
    it[f]=(f==="value"||f==="prod")?(v===""?"":Number(v)):v;
    if(entity==="neg"&&f==="outcome"&&v==="Won"&&!it.wonPo){const npo=makeDraftPO(it);c.data.pos.unshift(npo);it.wonPo=npo.id;pendingWonAlert=it.ref;}
    return;}}}
}
const main=document.getElementById("main");
main.addEventListener("input",e=>{const t=e.target;if(!t.dataset.entity)return;setField(t.dataset.entity,t.dataset.id,t.dataset.field,t.value);renderReport();save();});
main.addEventListener("change",e=>{const t=e.target;if(!t.dataset.entity||t.tagName!=="SELECT")return;setField(t.dataset.entity,t.dataset.id,t.dataset.field,t.value);renderReport();renderManage();save();
  if(pendingWonAlert){const r=pendingWonAlert;pendingWonAlert=null;setTimeout(()=>alert('"'+r+'" marked Won.\n\nA draft PO was created in Purchase Orders (value & product pre-filled) — open it to add the PO number and remaining details.'),40);}});

document.addEventListener("click",e=>{const add=e.target.closest("[data-add]"),del=e.target.closest("[data-del]"),deliver=e.target.closest("[data-deliver]"),mode=e.target.closest("[data-mode]"),act=e.target.closest("[data-action]"),tab=e.target.closest("[data-tab]");
  if(add)addItem(add.dataset.add);
  else if(deliver)deliverPO(deliver.dataset.deliver);
  else if(mode){reportMode=mode.dataset.mode;document.querySelectorAll(".mt").forEach(x=>x.classList.toggle("active",x.dataset.mode===reportMode));renderReport();}
  else if(del){const L=data[del.dataset.del];const i=L.findIndex(x=>x.id===del.dataset.id);if(i>-1)L.splice(i,1);renderReport();renderManage();save();}
  else if(act)doAction(act.dataset.action);
  else if(tab)switchTab(tab.dataset.tab);});
document.getElementById("clientSelect").addEventListener("change",e=>{store.activeClientId=e.target.value;renderAll();save();switchTab("report");});

function addItem(kind){
  if(kind==="pos")data.pos.push({id:uid(),code:"PO-2026-0000",ndr:"",product:"New product",qty:"1×40′HC",value:0,incoterm:"FOB Qingdao",prod:0,insp:"Pending",inspDate:"",cargoReady:"TBD",eta:"TBD",port:"Santos",stage:"Confirmed"});
  if(kind==="neg")data.neg.push({id:uid(),ref:"NEG-00",topic:"New topic",next:"define next step",owner:"Desk",due:"TBD",value:0,stage:"Quotation",outcome:"Open",samples:"N/A"});
  if(kind==="act")data.act.push({id:uid(),type:"gold",text:"New alert",owner:"Trading Desk"});
  if(kind==="cl")data.closed.push({id:uid(),code:"PO-2026-0000",ndr:"",product:"New product",value:0,delivered:"TBD",port:"Santos"});
  renderReport();renderManage();save();}
function deliverPO(id){const i=data.pos.findIndex(p=>p.id===id);if(i<0)return;const p=data.pos[i];
  const d=new Date();const def=String(d.getDate()).padStart(2,"0")+" "+d.toLocaleString("en",{month:"short"})+" "+d.getFullYear();
  const date=prompt("Mark "+(p.code||"this PO")+" as delivered.\n\nDelivered date (shown on the record):",def);if(date===null)return;
  data.closed.unshift({id:uid(),code:p.code,ndr:p.ndr||"",product:p.product,value:Number(p.value)||0,delivered:(date.trim()||def),port:p.port});
  data.pos.splice(i,1);renderReport();renderManage();save();}
function switchTab(name){document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+name));if(name==="report")requestAnimationFrame(fitReport);}
function resizeImage(file,max){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{let w=img.width,h=img.height;if(w>h){if(w>max){h=h*max/w;w=max;}}else{if(h>max){w=w*max/h;h=max;}}const cv=document.createElement("canvas");cv.width=w;cv.height=h;cv.getContext("2d").drawImage(img,0,0,w,h);res(cv.toDataURL("image/png"));};img.onerror=rej;img.src=r.result;};r.onerror=rej;r.readAsDataURL(file);});}
function doAction(a){
  if(a==="print"){switchTab("report");requestAnimationFrame(()=>setTimeout(()=>window.print(),120));}
  else if(a==="export"){const blob=new Blob([JSON.stringify(store,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),el=document.createElement("a");el.href=url;el.download="account-reports-"+new Date().toISOString().slice(0,10)+".json";el.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  else if(a==="import")document.getElementById("fileImport").click();
  else if(a==="reset"){if(confirm("Reset ALL clients to the sample data? Current entries will be replaced.")){store=seedStore();renderAll();save();switchTab("report");}}
  else if(a==="logo-upload")document.getElementById("logoInput").click();
  else if(a==="logo-remove"){store.logo=null;renderReport();renderManage();save();}
  else if(a==="client-new"){const n=prompt("New client name:");if(n&&n.trim()){const c={id:uid(),data:blankData(n.trim())};store.clients.push(c);store.activeClientId=c.id;renderAll();save();switchTab("settings");}}
  else if(a==="client-rename"){const n=prompt("Rename client:",data.meta.client);if(n&&n.trim()){data.meta.client=n.trim();renderClientSelect();renderReport();renderManage();save();}}
  else if(a==="client-del"){if(store.clients.length<=1){alert("Keep at least one client.");return;}if(confirm('Delete client "'+data.meta.client+'" and all its entries?')){store.clients=store.clients.filter(c=>c.id!==store.activeClientId);store.activeClientId=store.clients[0].id;renderAll();save();switchTab("report");}}
}
document.getElementById("logoInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{store.logo=await resizeImage(f,300);renderReport();renderManage();save();}catch(err){alert("Couldn't read that image.");}e.target.value="";});
document.getElementById("fileImport").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{try{const mg=migrateStore(JSON.parse(r.result));if(!mg)throw 0;["pos","neg","act","closed"].forEach(k=>mg.clients.forEach(c=>c.data[k].forEach(x=>x.id=x.id||uid())));store=mg;renderAll();save();switchTab("report");}catch(err){alert("That file couldn't be read as a valid backup.");}};
  r.readAsText(f);e.target.value="";});
window.addEventListener("resize",()=>requestAnimationFrame(fitReport));
(async function(){const saved=await load();if(saved){const mg=migrateStore(saved);if(mg)store=mg;}renderAll();requestAnimationFrame(fitReport);})();
