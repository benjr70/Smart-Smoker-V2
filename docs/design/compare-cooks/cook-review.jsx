/* Review features: clone a past cook as a template, and compare two cooks. */

const RATING_KEYS = [
  ['smokeFlavor','Smoke flavor'], ['seasoning','Seasoning'],
  ['tenderness','Tenderness'], ['overallTaste','Overall taste'],
];

/* ── COOK AGAIN ───────────────────────────────────────
   Carries the repeatable parts forward; leaves the outcome behind. */
function CookAgainSheet({ item, onCancel, onStart }) {
  const t = useTheme();
  const [carry, setCarry] = React.useState({ prep:true, wood:true, target:true, rest:true, post:true });
  const toggle = (k) => setCarry(p=>({...p,[k]:!p[k]}));

  React.useEffect(()=>{
    const esc = e => e.key==='Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return ()=>window.removeEventListener('keydown', esc);
  },[onCancel]);

  const rows = [
    { k:'prep',   label:'Prep steps',   value:`${item.prepSteps.length} steps` },
    { k:'wood',   label:'Wood',         value:item.wood },
    { k:'target', label:'Target temp',  value:`${item.target}°F` },
    { k:'rest',   label:'Rest time',    value:fmtRest(item.restTime) },
    { k:'post',   label:'Post steps',   value:`${item.postSteps.length} steps` },
  ];

  const build = () => onStart({
    name: item.name,
    meat: item.meat, weight: item.weight, unit: item.unit,
    wood: carry.wood ? item.wood : 'Post Oak',
    target: carry.target ? item.target : 203,
    steps: carry.prep ? [...item.prepSteps] : [''],
    postSteps: carry.post ? [...item.postSteps] : [''],
    restTime: carry.rest ? item.restTime : '00:45',
    notes: '',
  });

  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,zIndex:60,background:'rgba(0,0,0,.5)',
      display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:480,background:t.surface,
        borderRadius:'20px 20px 0 0',padding:'8px 16px 24px',animation:'sheetUp .24s ease',
        boxShadow:t.shadowMd,maxHeight:'88dvh',overflowY:'auto'}}>
        <div style={{width:40,height:4,borderRadius:2,background:t.border,margin:'6px auto 16px'}}></div>
        <div style={{fontSize:20,fontWeight:800,color:t.text,letterSpacing:-.3}}>Cook this again</div>
        <div style={{fontSize:14,color:t.sub,marginTop:4,lineHeight:1.45}}>
          Starts a new session from <strong style={{color:t.text,fontWeight:700}}>{item.name}</strong>. Pick what carries over.
        </div>

        <div style={{marginTop:16,background:t.surfaceAlt,borderRadius:12,padding:'2px 14px'}}>
          <div style={{display:'flex',alignItems:'center',padding:'12px 0',borderBottom:`1px solid ${t.border}`}}>
            <span style={{flex:1,fontSize:14,fontWeight:600,color:t.text}}>{item.weight} {item.unit} {item.meat}</span>
            <span style={{fontSize:12,color:t.sub,fontWeight:600}}>ALWAYS</span>
          </div>
          {rows.map((r,i)=>(
            <button key={r.k} onClick={()=>toggle(r.k)}
              style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'11px 0',minHeight:52,
                background:'transparent',border:'none',cursor:'pointer',fontFamily:'inherit',textAlign:'left',
                borderBottom:i===rows.length-1?'none':`1px solid ${t.border}`}}>
              <span style={{width:22,height:22,borderRadius:6,flexShrink:0,display:'flex',alignItems:'center',
                justifyContent:'center',background:carry[r.k]?t.accent:'transparent',
                border:`1.5px solid ${carry[r.k]?t.accent:t.inputBorder}`}}>
                {carry[r.k] && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12.5l4.5 4.5L19 7" stroke={t.onAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <span style={{flex:1,fontSize:14,fontWeight:600,color:t.text}}>{r.label}</span>
              <span style={{fontSize:13,color:t.sub,textAlign:'right'}}>{r.value}</span>
            </button>
          ))}
        </div>

        <div style={{fontSize:12,color:t.sub,marginTop:12,lineHeight:1.5}}>
          Ratings, notes and temperature history stay with the original cook.
        </div>
        <div style={{display:'flex',gap:10,marginTop:16}}>
          <Btn variant="ghost" onClick={onCancel} size="lg" style={{flex:1}}>Cancel</Btn>
          <Btn onClick={build} size="lg" style={{flex:1.4}}>Start session</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── COOK PICKER ──────────────────────────────────────
   Two dropdowns made you already know which cook you wanted.
   This searches, sorts, and shows enough of each cook to recognise it. */
function CookPickerSheet({ items, side, currentId, otherId, onPick, onCancel }) {
  const t = useTheme();
  const [q, setQ] = React.useState('');
  const [sort, setSort] = React.useState('recent');
  const [meat, setMeat] = React.useState('All');

  React.useEffect(()=>{
    const esc = e => e.key==='Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return ()=>window.removeEventListener('keydown', esc);
  },[onCancel]);

  const meats = ['All', ...Array.from(new Set(items.map(i=>i.meat)))];
  const needle = q.trim().toLowerCase();
  const shown = items
    .filter(i=>meat==='All'||i.meat===meat)
    .filter(i=>!needle || [i.name,i.meat,i.wood,i.date].join(' ').toLowerCase().includes(needle))
    .sort((x,y)=> sort==='best'
      ? (y.ratings.overallTaste||0)-(x.ratings.overallTaste||0)
      : sort==='name' ? x.name.localeCompare(y.name)
      : y.id - x.id);

  const Pill = ({ on, children, onClick }) => (
    <button onClick={onClick}
      style={{height:36,padding:'0 13px',borderRadius:18,cursor:'pointer',fontFamily:'inherit',flexShrink:0,
        fontSize:13,fontWeight:600,whiteSpace:'nowrap',transition:'all .15s',
        background:on?t.accent:t.inputBg,color:on?t.onAccent:t.sub,
        border:`1.5px solid ${on?t.accent:t.inputBorder}`}}>{children}</button>
  );

  return (
    <div onClick={onCancel} style={{position:'fixed',inset:0,zIndex:70,background:'rgba(0,0,0,.5)',
      display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:480,background:t.surface,
        borderRadius:'20px 20px 0 0',animation:'sheetUp .24s ease',boxShadow:t.shadowMd,
        height:'86dvh',display:'flex',flexDirection:'column'}}>
        <div style={{flexShrink:0,padding:'8px 16px 12px',borderBottom:`1px solid ${t.border}`}}>
          <div style={{width:40,height:4,borderRadius:2,background:t.border,margin:'6px auto 14px'}}></div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:700,color:t.sub,letterSpacing:.5}}>PICK COOK {side}</div>
              <div style={{fontSize:19,fontWeight:800,color:t.text,letterSpacing:-.3}}>
                {shown.length} of {items.length} sessions
              </div>
            </div>
            <button onClick={onCancel} aria-label="Close"
              style={{width:44,height:44,flexShrink:0,border:'none',background:'transparent',cursor:'pointer',
                color:t.sub,fontSize:22,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
          </div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, meat or wood"
            style={{width:'100%',boxSizing:'border-box',height:48,padding:'0 14px',borderRadius:12,fontSize:15,
              fontFamily:'inherit',background:t.inputBg,color:t.text,border:`1.5px solid ${t.inputBorder}`,outline:'none'}}/>
          <div style={{display:'flex',gap:7,marginTop:10,overflowX:'auto',paddingBottom:2}}>
            {[['recent','Recent'],['best','Top rated'],['name','A–Z']].map(([k,l])=>(
              <Pill key={k} on={sort===k} onClick={()=>setSort(k)}>{l}</Pill>
            ))}
            <div style={{width:1,flexShrink:0,background:t.border,margin:'4px 3px'}}></div>
            {meats.map(m=><Pill key={m} on={meat===m} onClick={()=>setMeat(m)}>{m}</Pill>)}
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'8px 16px 20px'}}>
          {shown.length === 0 && (
            <div style={{padding:'40px 16px',textAlign:'center',fontSize:14,color:t.sub}}>
              No cooks match that search.
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {shown.map(i=>{
              const sel = i.id === currentId;
              const taken = i.id === otherId;
              const score = i.ratings.overallTaste || 0;
              return (
                <button key={i.id} onClick={()=>!taken && onPick(i.id)} disabled={taken}
                  style={{width:'100%',textAlign:'left',padding:'12px 14px',borderRadius:13,minHeight:72,
                    cursor:taken?'default':'pointer',fontFamily:'inherit',opacity:taken?.45:1,
                    background:sel?t.surfaceAlt:'transparent',
                    border:`1.5px solid ${sel?t.accent:t.border}`,transition:'all .15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{flex:1,minWidth:0,fontSize:15,fontWeight:700,color:t.text,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.name}</span>
                    {taken && <span style={{fontSize:10,fontWeight:700,color:t.sub,letterSpacing:.4,flexShrink:0}}>IN USE</span>}
                    {sel && !taken && (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
                        <path d="M5 12.5l4.5 4.5L19 7" stroke={t.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:7,marginTop:4,flexWrap:'wrap'}}>
                    {[i.date, `${i.weight} ${i.unit} ${i.meat}`, i.wood, i.duration].map((v,n)=>(
                      <React.Fragment key={n}>
                        {n>0 && <span style={{width:3,height:3,borderRadius:'50%',background:t.sub,opacity:.5}}></span>}
                        <span style={{fontSize:12,color:t.sub,fontWeight:n===0?600:400}}>{v}</span>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginTop:7}}>
                    <div style={{flex:1,height:5,borderRadius:3,background:t.surfaceAlt,overflow:'hidden',maxWidth:130}}>
                      <div style={{width:`${(score/10)*100}%`,height:'100%',borderRadius:3,
                        background:score>=8?t.ok:score>=6?t.probes.p1:t.probes.chamber}}></div>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:t.sub,fontVariantNumeric:'tabular-nums'}}>
                      {score.toFixed(1)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── OVERLAID TEMP CURVES ─────────────────────────────
   Two cooks rarely start at the same clock time, so the X axis is
   hours elapsed — that's what makes the climb rates comparable.
   Curves are reconstructed from each session's real duration, peak
   and target (the log keeps summary figures, not full traces). */
const PROBE_SLOTS = ['chamber','p1','p2','p3'];
const SLOT_LABEL = { chamber:'Chamber', p1:'Probe 1', p2:'Probe 2', p3:'Probe 3' };
const hasProbe = (item, slot) => {
  const n = (item.probes || {})[slot];
  return !!n && n !== '—' && n !== '-';
};

function sessionCurve(item) {
  const mins = (()=>{ const m = item.duration.match(/(\d+)h\s*(\d+)?/); return m ? +m[1]*60 + (+m[2]||0) : 480; })();
  const n = 60, out = [];
  let seed = item.id * 9301 + 49297;
  const rnd = () => (seed = (seed*9301 + 49297) % 233280) / 233280;
  const stallAt = .42, stallLen = .22;
  // p1 is the money probe; p2 trails it, p3 sits at grate level near the pit
  const climb = (f, gain) => {
    let g;
    if (f < stallAt) g = Math.pow(f/stallAt, .78)*.62;
    else if (f < stallAt+stallLen) g = .62 + ((f-stallAt)/stallLen)*.06;
    else g = .68 + Math.pow((f-stallAt-stallLen)/(1-stallAt-stallLen), 1.25)*.32;
    return Math.round(38 + (gain-38)*g);
  };
  for (let i=0; i<=n; i++) {
    const f = i/n;
    const cruise = item.peak.ch - 18;
    const ch = f < .06 ? 70 + (cruise-70)*(f/.06)
      : cruise + Math.sin(f*11 + item.id)*9 + (rnd()-.5)*5 + (f>.85 ? (item.peak.ch-cruise)*((f-.85)/.15) : 0);
    out.push({
      m: f*mins,
      chamber: Math.round(Math.max(60, ch)),
      p1: climb(f, item.peak.p1),
      p2: climb(f*.94, item.peak.p1 - 9),
      p3: Math.round(Math.max(60, ch) * .92 - 6),
    });
  }
  // stamps the pitmaster would have logged, placed against this cook's shape
  const at = (frac) => frac*mins;
  const stamps = [
    { id:'s1', type:'wood',   label:'Added Wood', tone:'chamber', m:at(.08) },
    { id:'s2', type:'spritz', label:'Spritzed',   tone:'p3',      m:at(.30) },
    { id:'s3', type:'wood',   label:'Added Wood', tone:'chamber', m:at(.38) },
    { id:'s4', type:'wrap',   label:'Wrapped',    tone:'p2',      m:at(stallAt+.04) },
    { id:'s5', type:'spritz', label:'Spritzed',   tone:'p3',      m:at(.58) },
    { id:'s6', type:'wood',   label:'Added Wood', tone:'chamber', m:at(.70) },
    { id:'s7', type:'sauce',  label:'Sauced',     tone:'p1',      m:at(.90) },
  ];
  return { pts: out, mins, stamps };
}

/* Stamp rail — letters crammed on the plot collide and read as noise.
   A dedicated lane per cook gives every stamp room and a real label. */
function StampRail({ curve, color, side, hoverM, onPick, picked, maxMin, padLeftPct, padRightPct }) {
  const t = useTheme();
  return (
    <div style={{position:'relative',height:30}}>
      <span style={{position:'absolute',left:0,top:9,width:14,fontSize:11,fontWeight:800,color,textAlign:'center'}}>{side}</span>
      <div style={{position:'absolute',left:padLeftPct,right:padRightPct,top:0,height:30}}>
        <div style={{position:'absolute',left:0,top:14,height:1.5,background:color,opacity:.3,borderRadius:1,
          width:`${(curve.mins/maxMin)*100}%`}}></div>
        {curve.stamps.map(s=>{
          const isPicked = picked === side+s.id;
          const near = hoverM != null && Math.abs(s.m - hoverM) < curve.mins*.03;
          const c = toneColor(t, s.tone);
          const big = isPicked || near;
          return (
            <button key={s.id} onClick={()=>onPick(isPicked?null:side+s.id)}
              aria-label={s.label}
              style={{position:'absolute',left:`${(s.m/maxMin)*100}%`,top:0,transform:'translateX(-50%)',
                width:30,height:30,padding:0,border:'none',background:'transparent',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{width:big?15:11,height:big?15:11,borderRadius:'50%',background:c,
                border:`2px solid ${t.surface}`,boxShadow:isPicked?`0 0 0 2px ${c}`:'none',transition:'all .15s'}}></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompareChart({ a, b, colorA, colorB }) {
  const t = useTheme();
  const [slots, setSlots] = React.useState({ chamber:true, p1:true, p2:false, p3:false });

  const [hoverM, setHoverM] = React.useState(null);
  const [picked, setPicked] = React.useState(null);
  const W = 360, H = 210, PAD = { l:40, r:10, t:14, b:26 };
  const dW = W-PAD.l-PAD.r, dH = H-PAD.t-PAD.b;

  const ca = React.useMemo(()=>sessionCurve(a),[a.id]);
  const cb = React.useMemo(()=>sessionCurve(b),[b.id]);
  const maxMin = Math.max(ca.mins, cb.mins);

  // a slot is offerable only if at least one cook actually ran that probe
  const avail = PROBE_SLOTS.filter(s=>hasProbe(a,s)||hasProbe(b,s));
  const on = avail.filter(s=>slots[s]);
  const vals = on.flatMap(s=>[
    ...(hasProbe(a,s) ? ca.pts.map(p=>p[s]) : []),
    ...(hasProbe(b,s) ? cb.pts.map(p=>p[s]) : []),
  ]);
  const yMin = vals.length ? Math.floor((Math.min(...vals)-15)/50)*50 : 0;
  const yMax = vals.length ? Math.ceil((Math.max(...vals)+15)/50)*50 : 300;

  const px = (m) => PAD.l + (m/maxMin)*dW;
  const py = (v) => PAD.t + (1-(v-yMin)/(yMax-yMin||1))*dH;
  const path = (pts, key) => pts.map((p,i)=>`${i?"L":"M"}${px(p.m).toFixed(1)} ${py(p[key]).toFixed(1)}`).join(' ');

  const yTicks = []; for (let v=yMin; v<=yMax; v+=(yMax-yMin)/4) yTicks.push(v);
  const xStep = Math.max(1, Math.ceil(maxMin/60/5));
  const xTicks = []; for (let h=0; h<=maxMin/60; h+=xStep) xTicks.push(h);

  const readAt = (c, m) => c.pts.reduce((best,p)=>Math.abs(p.m-m)<Math.abs(best.m-m)?p:best, c.pts[0]);
  const pickedStamp = (()=>{
    if (!picked) return null;
    const side = picked[0], c = side==='A'?ca:cb;
    const s = c.stamps.find(x=>side+x.id===picked);
    return s ? { s, side } : null;
  })();

  const track = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX != null ? e.clientX : e.touches[0].clientX;
    const x = (cx - r.left) / r.width * W;
    setHoverM(Math.max(0, Math.min(maxMin, ((x-PAD.l)/dW)*maxMin)));
  };

  // dash pattern separates the four probes when several are on at once
  const DASH = { chamber:'4,3', p1:'', p2:'7,3', p3:'1.5,3' };
  const WIDTH = { chamber:1.4, p1:2.4, p2:1.8, p3:1.4 };

  const nameOf = (item, slot) => hasProbe(item, slot) ? item.probes[slot] : null;

  const ProbeChip = ({ slot }) => {
    const active = slots[slot];
    return (
      <button onClick={()=>setSlots(p=>({...p,[slot]:!p[slot]}))}
        style={{minWidth:0,height:38,padding:'0 6px',borderRadius:10,cursor:'pointer',fontFamily:'inherit',
          background:active?t.surfaceAlt:'transparent',border:`1.5px solid ${active?t.text:t.border}`,
          display:'flex',alignItems:'center',justifyContent:'center',gap:5,transition:'all .15s'}}>
        <span style={{fontSize:12.5,fontWeight:700,color:active?t.text:t.sub,whiteSpace:'nowrap',
          overflow:'hidden',textOverflow:'ellipsis'}}>
          {SLOT_LABEL[slot]}
        </span>
      </button>
    );
  };

  /* Each cook names its probes differently. Position is the pairing — this
     just states which of their probes each position refers to. */
  const ProbeKey = () => {
    if (!on.length) return null;
    return (
      <div style={{margin:'0 0 12px',padding:'9px 11px',borderRadius:11,background:t.surfaceAlt,
        display:'flex',flexDirection:'column',gap:6}}>
        {on.map(slot=>{
          const na = nameOf(a, slot), nb = nameOf(b, slot);
          return (
            <div key={slot} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
              <svg width="15" height="7" style={{flexShrink:0,overflow:'visible'}}>
                <line x1="0" y1="3.5" x2="15" y2="3.5" stroke={t.sub} strokeWidth={WIDTH[slot]}
                  strokeDasharray={DASH[slot]} strokeLinecap="round"/>
              </svg>
                  <span style={{width:60,flexShrink:0,fontWeight:700,color:t.sub}}>{SLOT_LABEL[slot]}</span>
              <span style={{flex:1,minWidth:0,fontWeight:600,color:na?colorA:t.sub,
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{na || 'not used'}</span>
              <span style={{flex:1,minWidth:0,fontWeight:600,color:nb?colorB:t.sub,textAlign:'right',
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nb || 'not used'}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card style={{padding:'14px 12px 12px'}}>
      <div style={{padding:'0 4px'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:600,color:t.sub,letterSpacing:.5}}>HOW THEY COOKED</div>
          <div style={{fontSize:11,color:t.sub}}>hours elapsed</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:`repeat(${avail.length},1fr)`,gap:7,marginBottom:12}}>
          {avail.map(s=><ProbeChip key={s} slot={s}/>)}
        </div>
        <ProbeKey/>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block',touchAction:'none'}}
        onMouseMove={track} onMouseLeave={()=>setHoverM(null)} onTouchStart={track} onTouchMove={track}
        onTouchEnd={()=>setHoverM(null)}>
        {yTicks.map(v=>(
          <g key={v}>
            <line x1={PAD.l} y1={py(v)} x2={W-PAD.r} y2={py(v)} stroke={t.border} strokeWidth="1"/>
            <text x={PAD.l-7} y={py(v)+3.5} textAnchor="end" fontSize="9" fill={t.sub} fontFamily="Plus Jakarta Sans">{Math.round(v)}°</text>
          </g>
        ))}
        {xTicks.map(h=>(
          <text key={h} x={px(h*60)} y={H-8} textAnchor="middle" fontSize="9" fill={t.sub} fontFamily="Plus Jakarta Sans">{h}h</text>
        ))}
        {[[ca,colorA],[cb,colorB]].map(([c,color],i)=>(
          <line key={i} x1={px(c.mins)} y1={PAD.t} x2={px(c.mins)} y2={PAD.t+dH}
            stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity=".45"/>
        ))}
        {on.filter(s=>hasProbe(a,s)).map(s=>(
          <path key={'a'+s} d={path(ca.pts,s)} fill="none" stroke={colorA} strokeWidth={WIDTH[s]}
            strokeDasharray={DASH[s]} strokeLinecap="round" opacity={s==='p1'?1:.7}/>
        ))}
        {on.filter(s=>hasProbe(b,s)).map(s=>(
          <path key={'b'+s} d={path(cb.pts,s)} fill="none" stroke={colorB} strokeWidth={WIDTH[s]}
            strokeDasharray={DASH[s]} strokeLinecap="round" opacity={s==='p1'?1:.7}/>
        ))}
        {pickedStamp && (
          <line x1={px(pickedStamp.s.m)} y1={PAD.t} x2={px(pickedStamp.s.m)} y2={PAD.t+dH}
            stroke={toneColor(t, pickedStamp.s.tone)} strokeWidth="1.5" strokeDasharray="3,3"/>
        )}
        {hoverM!=null && (
          <g>
            <line x1={px(hoverM)} y1={PAD.t} x2={px(hoverM)} y2={PAD.t+dH} stroke={t.text} strokeWidth="1" opacity=".35"/>
            {hoverM<=ca.mins && on.filter(s=>hasProbe(a,s)).map(s=>{
              const r = readAt(ca, hoverM);
              return <circle key={'a'+s} cx={px(r.m)} cy={py(r[s])} r="3.2" fill={colorA} stroke={t.surface} strokeWidth="1.5"/>;
            })}
            {hoverM<=cb.mins && on.filter(s=>hasProbe(b,s)).map(s=>{
              const r = readAt(cb, hoverM);
              return <circle key={'b'+s} cx={px(r.m)} cy={py(r[s])} r="3.2" fill={colorB} stroke={t.surface} strokeWidth="1.5"/>;
            })}
          </g>
        )}
      </svg>

      {/* stamp lanes, aligned to the plot's x scale */}
      <div style={{padding:'6px 0 2px'}}>
        {[[ca,colorA,'A'],[cb,colorB,'B']].map(([c,color,side])=>(
          <StampRail key={side} curve={c} color={color} side={side} maxMin={maxMin}
            padLeftPct={`${(PAD.l/W)*100}%`} padRightPct={`${(PAD.r/W)*100}%`}
            hoverM={hoverM} picked={picked} onPick={setPicked}/>
        ))}
      </div>

      <div style={{padding:'6px 4px 0',borderTop:`1px solid ${t.border}`,marginTop:6}}>
        {pickedStamp ? (
          <div style={{display:'flex',alignItems:'center',gap:9,minHeight:38}}>
            <span style={{width:9,height:9,borderRadius:'50%',flexShrink:0,
              background:toneColor(t, pickedStamp.s.tone)}}></span>
            <span style={{fontSize:13,fontWeight:700,color:t.text}}>{pickedStamp.s.label}</span>
            <span style={{fontSize:12,color:t.sub,fontVariantNumeric:'tabular-nums'}}>
              Cook {pickedStamp.side} · {`${Math.floor(pickedStamp.s.m/60)}h ${String(Math.round(pickedStamp.s.m%60)).padStart(2,"0")}m`} in
            </span>
            <button onClick={()=>setPicked(null)} aria-label="Clear stamp"
              style={{marginLeft:'auto',width:38,height:38,border:'none',background:'transparent',cursor:'pointer',
                color:t.sub,fontSize:17,flexShrink:0}}>×</button>
          </div>
        ) : hoverM!=null ? (
          <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'2px 12px',minHeight:38}}>
            <span style={{fontSize:12,fontWeight:700,color:t.sub,fontVariantNumeric:'tabular-nums'}}>{`${Math.floor(hoverM/60)}h ${String(Math.round(hoverM%60)).padStart(2,"0")}m`} in</span>
            {[['A',ca,colorA,a],['B',cb,colorB,b]].map(([side,c,color,item])=>{
              const r = readAt(c, hoverM);
              return (
                <span key={side} style={{fontSize:12,color:t.sub,fontVariantNumeric:'tabular-nums'}}>
                  <span style={{color,fontWeight:800}}>{side}</span>{' '}
                  {hoverM<=c.mins
                    ? on.filter(s=>hasProbe(item,s)).map(s=>`${r[s]}°`).join(' / ')
                    : 'finished'}
                </span>
              );
            })}
          </div>
        ) : (
          <div style={{display:'flex',flexWrap:'wrap',gap:'4px 14px',minHeight:38,alignItems:'center'}}>
            {[[a,colorA,'A'],[b,colorB,'B']].map(([it,color,side])=>(
              <span key={side} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:t.sub}}>
                <span style={{width:14,height:2.5,borderRadius:2,background:color,flexShrink:0}}></span>
                <span style={{fontWeight:700,color:t.text}}>{side}</span>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:104}}>{it.name}</span>
                <span style={{fontVariantNumeric:'tabular-nums'}}>{it.duration}</span>
              </span>
            ))}
            <span style={{fontSize:11,color:t.sub,opacity:.75}}>Drag to scrub · tap a stamp for detail</span>
          </div>
        )}
      </div>
    </Card>
  );
}


/* A two-column dump of both step lists is hard to read; what a pitmaster
   wants is the delta — same steps collapse, differences stand out. */
function StepDiff({ title, num, aSteps, bSteps, aNotes, bNotes, aExtra, bExtra, extraLabel, colorA, colorB }) {
  const t = useTheme();
  const norm = (x) => x.trim().toLowerCase();
  const clean = (l) => (l||[]).filter(x=>x && x.trim());
  const A = clean(aSteps), B = clean(bSteps);
  const bSet = new Set(B.map(norm)), aSet = new Set(A.map(norm));
  const both = A.filter(x=>bSet.has(norm(x)));
  const onlyA = A.filter(x=>!bSet.has(norm(x)));
  const onlyB = B.filter(x=>!aSet.has(norm(x)));

  const Group = ({ label, items, color, dim }) => items.length ? (
    <div style={{marginTop:12}}>
      <div style={{fontSize:11,fontWeight:700,color:dim?t.sub:color,letterSpacing:.4,marginBottom:6}}>{label}</div>
      <div style={{display:'flex',flexDirection:'column',gap:5}}>
        {items.map((x,i)=>(
          <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
            <span style={{width:5,height:5,borderRadius:'50%',flexShrink:0,marginTop:6,
              background:dim?t.border:color}}></span>
            <span style={{fontSize:13,color:dim?t.sub:t.text,lineHeight:1.45}}>{x}</span>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <Card style={{padding:'14px 16px 16px'}}>
      <div style={{display:'flex',alignItems:'center',gap:9}}>
        <span style={{width:22,height:22,borderRadius:7,flexShrink:0,background:t.surfaceAlt,
          display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:t.sub}}>{num}</span>
        <span style={{fontSize:11,fontWeight:600,color:t.sub,letterSpacing:.5}}>{title}</span>
      </div>

      {aExtra && (
        <div style={{display:'flex',alignItems:'center',gap:10,marginTop:12,paddingBottom:2}}>
          <span style={{flex:1,fontSize:12,fontWeight:600,color:t.sub,letterSpacing:.2}}>{extraLabel}</span>
          <span style={{fontSize:14,fontWeight:700,color:aExtra===bExtra?t.sub:colorA,fontVariantNumeric:'tabular-nums'}}>{aExtra}</span>
          <span style={{fontSize:12,color:t.sub}}>/</span>
          <span style={{fontSize:14,fontWeight:700,color:aExtra===bExtra?t.sub:colorB,fontVariantNumeric:'tabular-nums'}}>{bExtra}</span>
        </div>
      )}

      <Group label={`SAME IN BOTH · ${both.length}`} items={both} dim/>
      <Group label="ONLY COOK A" items={onlyA} color={colorA}/>
      <Group label="ONLY COOK B" items={onlyB} color={colorB}/>
      {!onlyA.length && !onlyB.length && (
        <div style={{fontSize:12,color:t.sub,marginTop:10}}>Identical steps in both cooks.</div>
      )}

      {(aNotes || bNotes) && (
        <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${t.border}`,display:'flex',flexDirection:'column',gap:9}}>
          {[[aNotes,'A',colorA],[bNotes,'B',colorB]].map(([n,side,c])=> n ? (
            <div key={side} style={{display:'flex',gap:10}}>
              <span style={{width:16,flexShrink:0,fontSize:12,fontWeight:800,color:c}}>{side}</span>
              <span style={{flex:1,fontSize:13,color:t.text,lineHeight:1.5}}>{n}</span>
            </div>
          ) : null)}
        </div>
      )}
    </Card>
  );
}

/* ── COMPARE TWO COOKS ────────────────────────────────── */
function CompareBar({ a, b, max=10 }) {
  const t = useTheme();
  const Row = ({ v, color }) => (
    <div style={{height:6,borderRadius:3,background:t.surfaceAlt,overflow:'hidden'}}>
      <div style={{width:`${(v/max)*100}%`,height:'100%',borderRadius:3,background:color}}></div>
    </div>
  );
  return (
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      <Row v={a} color={t.probes.p2}/>
      <Row v={b} color={t.probes.chamber}/>
    </div>
  );
}

function CompareScreen({ items, initialId, onBack }) {
  const t = useTheme();
  const [aId, setAId] = React.useState(initialId || (items[0] && items[0].id));
  const [bId, setBId] = React.useState((items.find(i=>i.id!==(initialId||(items[0]&&items[0].id)))||{}).id);
  const [picking, setPicking] = React.useState(null);
  const a = items.find(i=>i.id===aId), b = items.find(i=>i.id===bId);
  const opts = items.map(i=>({value:i.id,label:`${i.name} · ${i.date}`}));

  const Slot = ({ side, item, color, onOpen }) => (
    <button onClick={onOpen}
      style={{flex:1,minWidth:0,textAlign:'left',padding:'10px 12px',borderRadius:13,cursor:'pointer',
        fontFamily:'inherit',background:t.surface,border:`1.5px solid ${t.border}`,minHeight:66}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
        <span style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}></span>
        <span style={{fontSize:10,fontWeight:700,color:t.sub,letterSpacing:.5}}>COOK {side}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{marginLeft:'auto',flexShrink:0}}>
          <path d="M6 9l6 6 6-6" stroke={t.sub} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{fontSize:14,fontWeight:700,color:t.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {item ? item.name : 'Choose…'}
      </div>
      <div style={{fontSize:11,color:t.sub,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {item ? `${item.date} · ${item.meat}` : 'Tap to pick'}
      </div>
    </button>
  );

  const pickerRow = (
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <Slot side="A" item={a} color={t.probes.p2} onOpen={()=>setPicking('A')}/>
      <button onClick={()=>{const x=aId;setAId(bId);setBId(x);}} aria-label="Swap cooks"
        style={{width:44,height:44,flexShrink:0,borderRadius:12,cursor:'pointer',background:t.inputBg,
          border:`1.5px solid ${t.inputBorder}`,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M7 8h11m0 0l-3-3m3 3l-3 3M17 16H6m0 0l3-3m-3 3l3 3" stroke={t.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <Slot side="B" item={b} color={t.probes.chamber} onOpen={()=>setPicking('B')}/>
    </div>
  );

  const sheet = picking && (
    <CookPickerSheet items={items} side={picking}
      currentId={picking==='A'?aId:bId} otherId={picking==='A'?bId:aId}
      onCancel={()=>setPicking(null)}
      onPick={id=>{ picking==='A'?setAId(id):setBId(id); setPicking(null); }}/>
  );

  const Header = ({ children }) => (
    <div style={{position:'sticky',top:0,zIndex:10,background:t.bg,padding:'16px 16px 12px',
      borderBottom:`1px solid ${t.border}`}}>{children}</div>
  );

  const backRow = (
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
      <button onClick={onBack} aria-label="Back"
        style={{width:44,height:44,marginLeft:-10,border:'none',background:'transparent',cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',borderRadius:11}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 5l-7 7 7 7" stroke={t.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div>
        <div style={{fontSize:11,fontWeight:600,color:t.sub,letterSpacing:.6}}>SMART SMOKER</div>
        <div style={{fontSize:20,fontWeight:800,color:t.text}}>Compare cooks</div>
      </div>
    </div>
  );

  if (!a || !b) return (
    <div>
      <Header>{backRow}</Header>
      <div style={{padding:'48px 24px',textAlign:'center',fontSize:14,color:t.sub}}>
        Log at least two cooks to compare them.
      </div>
    </div>
  );

  const num = (s) => parseFloat(s) || 0;
  const facts = [
    ['Meat',      a.meat, b.meat],
    ['Weight',    `${a.weight} ${a.unit}`, `${b.weight} ${b.unit}`],
    ['Wood',      a.wood, b.wood],
    ['Duration',  a.duration, b.duration],
    ['Target',    `${a.target}°`, `${b.target}°`],
    ['Peak chamber', `${a.peak.ch}°`, `${b.peak.ch}°`],
    ['Peak probe',   `${a.peak.p1}°`, `${b.peak.p1}°`],
    ['Rest',      fmtRest(a.restTime), fmtRest(b.restTime)],
  ];
  const winner = a.ratings.overallTaste === b.ratings.overallTaste ? null
    : a.ratings.overallTaste > b.ratings.overallTaste ? 'a' : 'b';

  const Swatch = ({ color, item, side }) => (
    <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:3}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <span style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}></span>
        <span style={{fontSize:11,fontWeight:700,color:t.sub,letterSpacing:.4}}>{side}</span>
      </div>
      <div style={{fontSize:15,fontWeight:700,color:t.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
      <div style={{fontSize:12,color:t.sub}}>{item.date}</div>
    </div>
  );

  return (
    <div>
      <Header>
        {backRow}
        {pickerRow}
      </Header>

      <div style={{padding:'12px 16px 16px',display:'flex',flexDirection:'column',gap:12}}>
        <Card style={{padding:16}}>
          <div style={{display:'flex',gap:14}}>
            <Swatch color={t.probes.p2} item={a} side="A"/>
            <Swatch color={t.probes.chamber} item={b} side="B"/>
          </div>
          {winner && (
            <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${t.border}`,fontSize:13,color:t.sub,lineHeight:1.5}}>
              <strong style={{color:t.text,fontWeight:700}}>{winner==='a'?a.name:b.name}</strong> scored higher overall
              — {Math.abs(a.ratings.overallTaste - b.ratings.overallTaste).toFixed(1)} points better.
            </div>
          )}
        </Card>

        <StepDiff num="1" title="PRE-SMOKE" colorA={t.probes.p2} colorB={t.probes.chamber}
          aSteps={a.prepSteps} bSteps={b.prepSteps} aNotes={a.preNotes} bNotes={b.preNotes}
          extraLabel="Wood" aExtra={a.wood} bExtra={b.wood}/>

        <CompareChart a={a} b={b} colorA={t.probes.p2} colorB={t.probes.chamber}/>

        <Card style={{padding:'4px 16px'}}>
          {facts.map(([label,va,vb],i)=>{
            const same = va===vb;
            return (
              <div key={label} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 0',
                borderBottom:i===facts.length-1?'none':`1px solid ${t.border}`}}>
                <span style={{width:104,flexShrink:0,fontSize:12,fontWeight:600,color:t.sub,letterSpacing:.2}}>{label}</span>
                <span style={{flex:1,minWidth:0,fontSize:14,fontWeight:700,color:same?t.sub:t.text,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{va}</span>
                <span style={{flex:1,minWidth:0,fontSize:14,fontWeight:700,color:same?t.sub:t.text,textAlign:'right',
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{vb}</span>
              </div>
            );
          })}
        </Card>

        <Card style={{padding:'14px 16px 16px'}}>
          <div style={{fontSize:11,fontWeight:600,color:t.sub,letterSpacing:.5,marginBottom:12}}>RATINGS</div>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {RATING_KEYS.map(([key,label])=>{
              const va = a.ratings[key]||0, vb = b.ratings[key]||0;
              const d = va - vb;
              return (
                <div key={key}>
                  <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:5}}>
                    <span style={{fontSize:13,fontWeight:600,color:t.text}}>{label}</span>
                    <span style={{fontSize:12,fontWeight:700,fontVariantNumeric:'tabular-nums',
                      color: Math.abs(d)<.05 ? t.sub : d>0 ? t.probes.p2 : t.probes.chamber}}>
                      {va.toFixed(1)} · {vb.toFixed(1)}
                      {Math.abs(d)>=.05 && <span style={{color:t.sub,fontWeight:600}}>  {d>0?'▲':'▼'}{Math.abs(d).toFixed(1)}</span>}
                    </span>
                  </div>
                  <CompareBar a={va} b={vb}/>
                </div>
              );
            })}
          </div>
        </Card>

        <Card style={{padding:'14px 16px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}>
            <span style={{width:22,height:22,borderRadius:7,flexShrink:0,background:t.surfaceAlt,
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:t.sub}}>2</span>
            <span style={{fontSize:11,fontWeight:600,color:t.sub,letterSpacing:.5}}>SMOKE NOTES</span>
          </div>
          {[[a,'A',t.probes.p2],[b,'B',t.probes.chamber]].map(([it,side,c])=>(
            <div key={side} style={{display:'flex',gap:10,padding:'8px 0'}}>
              <span style={{width:16,flexShrink:0,fontSize:12,fontWeight:800,color:c}}>{side}</span>
              <span style={{flex:1,fontSize:13,color:t.text,lineHeight:1.5}}>{it.smokeNotes}</span>
            </div>
          ))}
        </Card>

        <StepDiff num="3" title="POST-SMOKE" colorA={t.probes.p2} colorB={t.probes.chamber}
          aSteps={a.postSteps} bSteps={b.postSteps} aNotes={a.postNotes} bNotes={b.postNotes}
          extraLabel="Rest" aExtra={fmtRest(a.restTime)} bExtra={fmtRest(b.restTime)}/>
      </div>
      {sheet}
    </div>
  );
}

Object.assign(window, { CookAgainSheet, CompareScreen, CookPickerSheet, CompareChart, StepDiff, sessionCurve, CompareBar, RATING_KEYS });
