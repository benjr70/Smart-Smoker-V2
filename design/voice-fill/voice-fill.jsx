/* ─── VOICE FILL ─────────────────────────────────────────
   Tap the mic, describe the step out loud, AI maps it onto the
   step's fields. Built for greasy hands: one big tap to start,
   one big tap to stop, review in a sheet, undo from a toast. */

const SPEECH_MODELS = [
  { id:'device',   mb:45,   name:'On-device',         hint:'Uses your phone\u2019s built-in recognizer', tags:['Offline','Fastest'] },
  { id:'whisper',  mb:1550, name:'Whisper Large v3',  hint:'Best with pit noise, fans and wind',       tags:['Cloud','Most accurate'] },
  { id:'whisperS', mb:240,  name:'Whisper Small',     hint:'Downloads once (240 MB), runs locally',    tags:['Offline'] },
  { id:'deepgram', mb:180,  name:'Deepgram Nova-3',   hint:'Streams words as you talk',                tags:['Cloud','Low latency'] },
];
const LLM_MODELS = [
  { id:'haiku',  mb:820,  name:'Claude Haiku 4.5',  hint:'Quick, cheap, handles most cooks',      tags:['Cloud','Fast'] },
  { id:'sonnet', mb:2400, name:'Claude Sonnet 4.5', hint:'Better with long, rambling notes',      tags:['Cloud','Smartest'] },
  { id:'gpt',    mb:1100, name:'GPT-4o mini',       hint:'Alternative cloud extractor',           tags:['Cloud'] },
  { id:'local',  mb:2,    name:'Quick parse',       hint:'Keyword rules on the phone, no network', tags:['Offline','Basic'] },
];
const VOICE_DEFAULTS = { enabled:true, speech:'device', llm:'haiku', review:true, offlineFallback:true };

const MEATS = ['Brisket','Ribs','Pork Shoulder','Turkey','Chicken','Chuck Roast','Other'];
const WOODS = ['Post Oak','Hickory','Pecan','Apple','Cherry','Mesquite'];

const VOICE_SCHEMAS = {
  pre: { title:'Pre-Smoke', fields:[
    { key:'name',   label:'Session name', type:'text' },
    { key:'meat',   label:'Meat type',    type:'enum', options:MEATS },
    { key:'weight', label:'Weight',       type:'number' },
    { key:'unit',   label:'Unit',         type:'enum', options:['lb','oz','kg'] },
    { key:'steps',  label:'Prep steps',   type:'list' },
    { key:'notes',  label:'Notes',        type:'text' },
  ], demo:'Call this one Saturday Packer. It\u2019s a 16 pound prime brisket. Prep steps: trimmed the fat cap to a quarter inch, then mustard binder, then 50/50 salt and pepper. Notes: dry brined overnight, picked it up from the butcher on 5th.' },
  smoke: { title:'Smoke', fields:[
    { key:'chamber', label:'Pit probe name', type:'text' },
    { key:'p1',      label:'Probe 1 name',   type:'text' },
    { key:'p2',      label:'Probe 2 name',   type:'text' },
    { key:'p3',      label:'Probe 3 name',   type:'text' },
    { key:'target',  label:'Target temp',    type:'number' },
    { key:'wood',    label:'Wood type',      type:'enum', options:WOODS },
    { key:'notes',   label:'Notes',          type:'text' },
    { key:'log',     label:'Cook log',       type:'stamps' },
  ], demo:'Probe one is the flat, probe two is the point. Bump the target to 205. Running post oak. I just wrapped in butcher paper and spritzed it first. Note: stall hit around 160 for two hours.' },
  post: { title:'Post-Smoke', fields:[
    { key:'restTime', label:'Rest time', type:'hhmm' },
    { key:'steps',    label:'Post steps', type:'list' },
    { key:'notes',    label:'Notes',      type:'text' },
  ], demo:'Resting for 2 hours in the cooler. Steps: wrap in towels, then into the cooler, then slice against the grain. Notes: bark held up great and the point was jiggly.' },
};

/* ── offline quick parse (also the fallback when Wi-Fi drops) ── */
const NUMW = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12,fifteen:15,sixteen:16,eighteen:18,twenty:20,thirty:30,forty:40,'forty-five':45,an:1,a:1};
const num = s => s==null ? null : (isNaN(+s) ? NUMW[s.toLowerCase()] : +s);
const cap = s => s.trim().replace(/^\w/, c=>c.toUpperCase()).replace(/[.,;]+$/,'');
const listAfter = (txt, re) => {
  const m = txt.match(re); if (!m) return null;
  const body = m[1].split(/(?:notes?\s*[:,]|\.\s)/i)[0];
  return body.split(/,\s*(?:and\s+)?(?:then\s+)?|\s+then\s+|\s+and then\s+/i).map(cap).filter(Boolean);
};
function quickParse(step, txt, stamps) {
  const out = {}, low = txt.toLowerCase();
  const notes = txt.match(/notes?\s*[:,]?\s+(.+)$/i);
  if (notes) out.notes = cap(notes[1]);
  if (step==='pre') {
    const n = txt.match(/(?:call (?:this|it)(?: one)?|session name(?: is)?|name it)\s+([^.,]+)/i); if (n) out.name = cap(n[1]);
    const w = low.match(/(\d+(?:\.\d+)?|\w+)\s*(?:-|\s)?(pound|lb|kilo|kg|ounce|oz)/);
    if (w && num(w[1])) { out.weight = String(num(w[1])); out.unit = /kil|kg/.test(w[2])?'kg':/oun|oz/.test(w[2])?'oz':'lb'; }
    const meat = MEATS.find(m=>low.includes(m.toLowerCase())) || (/butt|shoulder/.test(low)?'Pork Shoulder':/rib/.test(low)?'Ribs':null);
    if (meat) out.meat = meat;
    const s = listAfter(txt, /(?:prep steps?|steps?)\s*[:,]?\s+(.+)/i); if (s) out.steps = s;
  }
  if (step==='smoke') {
    const tg = low.match(/target[^\d]{0,12}(\d{3})/); if (tg) out.target = +tg[1];
    const wd = WOODS.find(w=>low.includes(w.toLowerCase())); if (wd) out.wood = wd;
    const re = /probe (one|two|three|1|2|3)(?: is| on)?(?: the)?\s+([a-z ]+?)(?=[,.]| and |$)/gi; let m;
    while ((m = re.exec(txt))) out['p'+num(m[1])] = cap(m[2]);
    const pit = low.match(/(?:pit|chamber) probe(?: is)?(?: the)?\s+([a-z ]+?)(?=[,.]|$)/); if (pit) out.chamber = cap(pit[1]);
    const log = [];
    const hits = { wrap:/\bwrap/, spritz:/spritz|sprayed|mopped/, wood:/added (?:some )?wood|threw (?:on )?(?:a )?(?:split|chunk)|new split/, vent:/vent/, lid:/opened the lid|lid open/, sauce:/sauced|glazed/ };
    Object.entries(hits).forEach(([k,r])=>{ if (r.test(low) && (stamps||[]).some(s=>s.key===k&&s.on!==false)) log.push(k); });
    if (log.length) out.log = log;
  }
  if (step==='post') {
    const r = low.match(/rest(?:ing|ed)?\s+(?:it\s+)?(?:for\s+)?(\d+(?:\.\d+)?|an?|one|two|three|four|thirty|forty-five|twenty)\s*(hours?|hrs?|minutes?|mins?)(\s+and a half)?/);
    if (r) { let mins = num(r[1]) * (/h/.test(r[2])?60:1) + (r[3]?30:0); out.restTime = `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(Math.round(mins%60)).padStart(2,'0')}`; }
    const s = listAfter(txt, /steps?\s*[:,]?\s+(.+)/i); if (s) out.steps = s;
  }
  return out;
}

async function extractFields(step, transcript, values, cfg, stamps) {
  const schema = VOICE_SCHEMAS[step];
  if (cfg.llm==='local' || !window.claude || !navigator.onLine) return { fields:quickParse(step, transcript, stamps), via:'local' };
  const spec = schema.fields.map(f=>`- ${f.key} (${f.label}): ${
    f.type==='enum'?`one of ${f.options.join(' | ')}`:f.type==='list'?'array of short strings, the FULL updated list':
    f.type==='number'?'number':f.type==='hhmm'?'"HH:MM" string':f.type==='stamps'?`array of stamp keys from ${stamps.filter(s=>s.on!==false).map(s=>`${s.key}="${s.label}"`).join(', ')} — only events the cook says just happened`:'string'}`).join('\n');
  const prompt = `You fill in a BBQ smoking app form from a spoken description. Step: ${schema.title}.
Fields:
${spec}
Current values: ${JSON.stringify(values)}
Transcript: """${transcript}"""
Return ONLY a JSON object with the fields the speaker actually mentioned or changed. Clean up wording (capitalise, no filler words). Omit anything not mentioned.`;
  try {
    const res = await Promise.race([window.claude.complete(prompt), new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')), 15000))]);
    const json = JSON.parse(res.slice(res.indexOf('{'), res.lastIndexOf('}')+1));
    return { fields:json, via:'llm' };
  } catch (e) {
    if (!cfg.offlineFallback) throw e;
    return { fields:quickParse(step, transcript, stamps), via:'fallback' };
  }
}

function buildChanges(step, extracted, values, stamps) {
  const norm = v => Array.isArray(v) ? v.join('|').toLowerCase() : String(v??'').trim().toLowerCase();
  return VOICE_SCHEMAS[step].fields.filter(f=>extracted[f.key]!=null && extracted[f.key]!=='').map(f=>{
    let to = extracted[f.key];
    if (f.type==='number') to = f.key==='weight' ? String(to) : +to;
    if (f.type==='enum') to = f.options.find(o=>o.toLowerCase()===String(to).toLowerCase()) || null;
    if (f.type==='stamps') to = (Array.isArray(to)?to:[to]).filter(k=>stamps.some(s=>s.key===k));
    return { ...f, from:values[f.key], to };
  }).filter(c=>c.to!=null && (c.type==='stamps' ? c.to.length : norm(c.to)!==norm(c.from)));
}

/* ── hook each step uses ── */
function useVoiceFlash() {
  const [flash, setFlash] = React.useState({});
  const trigger = keys => { setFlash(Object.fromEntries(keys.map(k=>[k,true]))); setTimeout(()=>setFlash({}), 2600); };
  return [flash, trigger];
}

/* ── UI ── */
function MicGlyph({ size=26, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill={color}/>
      <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function VoiceFab({ onClick, label, notReady }) {
  const t = window.useTheme();
  if (notReady) return (
    <div role="status" style={{position:'absolute',right:16,bottom:16,zIndex:20,height:52,padding:'0 18px',borderRadius:26,
      background:t.surface,border:`1.5px solid ${t.border}`,color:t.sub,display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600,boxShadow:t.shadowMd}}>
      <MicGlyph color={t.sub} size={18}/>{notReady}
    </div>
  );
  return (
    <button onClick={onClick} aria-label={`Fill ${label} by voice`}
      style={{position:'absolute',right:16,bottom:16,zIndex:20,height:60,padding:'0 22px 0 18px',borderRadius:30,border:'none',
        background:t.accent,color:t.onAccent,display:'flex',alignItems:'center',gap:9,cursor:'pointer',fontFamily:'inherit',
        fontSize:15,fontWeight:700,boxShadow:`0 6px 20px ${t.accent}55, ${t.shadowMd}`}}>
      <MicGlyph color={t.onAccent} size={24}/>Voice fill
    </button>
  );
}

function LevelBars({ active }) {
  const t = window.useTheme();
  return (
    <div aria-hidden="true" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,height:40}}>
      {Array.from({length:13},(_,i)=>(
        <div key={i} style={{width:5,borderRadius:3,background:t.accent,height:active?'100%':6,
          animation:active?`vfBar ${.7+((i*37)%5)/10}s ease-in-out ${(i%4)*.09}s infinite alternate`:'none',
          opacity:active?1:.35,transformOrigin:'center'}}></div>
      ))}
    </div>
  );
}

const fmtVal = (c, v, stamps) => {
  if (v==null || v==='' || (Array.isArray(v)&&!v.length)) return '—';
  if (c.type==='stamps') return v.map(k=>(stamps.find(s=>s.key===k)||{label:k}).label).join(', ');
  if (c.type==='list') return v;
  if (c.type==='hhmm') return window.fmtRest(v);
  if (c.key==='target') return `${v}°F`;
  return String(v);
};

function VoiceSheet({ step, values, cfg, stamps, onApply, onClose }) {
  const t = window.useTheme();
  const schema = VOICE_SCHEMAS[step];
  const [phase, setPhase] = React.useState('listening'); // listening | working | review | empty | error
  const [text, setText] = React.useState('');
  const [interim, setInterim] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [picked, setPicked] = React.useState({});
  const [editing, setEditing] = React.useState(false);
  const recRef = React.useRef(null), demoRef = React.useRef(null), textRef = React.useRef('');
  const speechName = (SPEECH_MODELS.find(m=>m.id===cfg.speech)||SPEECH_MODELS[0]).name;
  const llmName = (LLM_MODELS.find(m=>m.id===cfg.llm)||LLM_MODELS[0]).name;

  const setT = v => { textRef.current = v; setText(v); };
  const startDemo = () => {
    const words = schema.demo.split(' '); let i = 0;
    demoRef.current = setInterval(()=>{ i++; setT(words.slice(0,i).join(' ')); if (i>=words.length) clearInterval(demoRef.current); }, 140);
  };
  const start = () => {
    setT(''); setInterim(''); setPhase('listening'); setResult(null); setEditing(false);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (cfg.speech==='device' && SR) {
      try {
        const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = 'en-US';
        let gotAny = false;
        r.onresult = e => { gotAny = true; let fin = '', mid = '';
          for (let i=0;i<e.results.length;i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (mid += e.results[i][0].transcript));
          setT(fin.trim()); setInterim(mid); };
        r.onerror = () => { if (!gotAny) { recRef.current = null; startDemo(); } };
        r.start(); recRef.current = r; return;
      } catch (e) {}
    }
    startDemo();
  };
  const stopCapture = () => { clearInterval(demoRef.current); if (recRef.current) { try { recRef.current.stop(); } catch(e){} recRef.current = null; } };
  React.useEffect(()=>{ start(); return stopCapture; }, []);

  const finish = async (override) => {
    stopCapture();
    const said = (override ?? (textRef.current + ' ' + interim)).trim();
    setT(said); setInterim('');
    if (!said) { setPhase('empty'); return; }
    setPhase('working');
    try {
      const r = await extractFields(step, said, values, cfg, stamps);
      const changes = buildChanges(step, r.fields, values, stamps);
      setResult({ ...r, changes });
      setPicked(Object.fromEntries(changes.map(c=>[c.key,true])));
      if (!changes.length) { setPhase('empty'); return; }
      if (!cfg.review) { onApply(changes, r.via); return; }
      setPhase('review');
    } catch (e) { setPhase('error'); }
  };

  const chosen = result ? result.changes.filter(c=>picked[c.key]) : [];
  const sheetBtn = (primary) => ({height:56,borderRadius:14,border:primary?'none':`1.5px solid ${t.border}`,cursor:'pointer',fontFamily:'inherit',
    fontSize:16,fontWeight:700,background:primary?t.accent:'transparent',color:primary?t.onAccent:t.text,flex:1});
  const viaNote = result && result.via!=='llm'
    ? (result.via==='fallback' ? `No connection — used Quick parse on the phone. Double-check before filling.` : 'Quick parse — keyword rules, no network.')
    : `${speechName} → ${llmName}`;

  return (
    <div onClick={phase==='listening'?undefined:onClose} role="dialog" aria-modal="true" aria-label={`Voice fill ${schema.title}`}
      style={{position:'fixed',inset:0,zIndex:60,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'flex-end',justifyContent:'center',animation:'fadeIn .15s ease'}}>
      <div onClick={e=>e.stopPropagation()}
        style={{width:'100%',maxWidth:480,maxHeight:'88dvh',display:'flex',flexDirection:'column',background:t.surface,borderRadius:'22px 22px 0 0',
          boxShadow:t.shadowMd,animation:'sheetUp .22s cubic-bezier(.2,.8,.2,1)',paddingBottom:'env(safe-area-inset-bottom)'}}>
        <div style={{padding:'12px 20px 0'}}>
          <div style={{width:38,height:4,borderRadius:2,background:t.border,margin:'0 auto 14px'}}></div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:t.sub,letterSpacing:.6}}>VOICE FILL · {schema.title.toUpperCase()}</div>
              <div style={{fontSize:20,fontWeight:800,color:t.text,marginTop:2}}>
                {{listening:'Listening…',working:'Filling in fields…',review:`Found ${result&&result.changes.length} ${result&&result.changes.length===1?'field':'fields'}`,empty:'Nothing to fill',error:'Couldn\u2019t reach the model'}[phase]}
              </div>
            </div>
            <button onClick={()=>{stopCapture();onClose();}} aria-label="Close"
              style={{width:44,height:44,borderRadius:12,border:'none',background:t.surfaceAlt,color:t.sub,fontSize:20,cursor:'pointer',flexShrink:0}}>×</button>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'14px 20px 4px'}}>
          {phase==='listening' && (
            <>
              <div style={{fontSize:13,color:t.sub,lineHeight:1.5,marginBottom:12}}>
                Talk through it naturally — {schema.fields.filter(f=>f.type!=='stamps').map(f=>f.label.toLowerCase()).slice(0,5).join(', ')}{step==='smoke'?', or what you just did (wrapped, spritzed…)':''}.
              </div>
              <div style={{minHeight:120,fontSize:19,lineHeight:1.5,fontWeight:500,color:text||interim?t.text:t.sub,textWrap:'pretty'}}>
                {text}{interim && <span style={{color:t.sub}}> {interim}</span>}
                {!text && !interim && 'Start talking…'}
              </div>
              <LevelBars active/>
            </>
          )}

          {phase==='working' && (
            <>
              <div style={{fontSize:15,lineHeight:1.55,color:t.sub,background:t.surfaceAlt,borderRadius:12,padding:'12px 14px'}}>“{text}”</div>
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'22px 2px'}}>
                <div style={{width:20,height:20,borderRadius:'50%',border:`2.5px solid ${t.border}`,borderTopColor:t.accent,animation:'vfSpin .8s linear infinite'}}></div>
                <span style={{fontSize:14,color:t.sub}}>{cfg.llm==='local'?'Quick parse':llmName} is reading it…</span>
              </div>
            </>
          )}

          {(phase==='review'||phase==='empty'||phase==='error') && (
            <div style={{marginBottom:14}}>
              {editing
                ? <textarea autoFocus value={text} onChange={e=>setT(e.target.value)} rows={4}
                    style={{width:'100%',background:t.inputBg,border:`1.5px solid ${t.accent}`,borderRadius:12,padding:'12px 14px',fontSize:15,
                      lineHeight:1.5,color:t.text,fontFamily:'inherit',outline:'none',resize:'none'}}/>
                : <div style={{fontSize:14,lineHeight:1.55,color:t.sub,background:t.surfaceAlt,borderRadius:12,padding:'12px 14px'}}>“{text||'…'}”</div>}
              <div style={{display:'flex',gap:8,marginTop:8}}>
                {editing
                  ? <button onClick={()=>finish(text)} style={{height:40,padding:'0 14px',borderRadius:10,border:'none',background:t.accentBg,color:t.accent,fontWeight:700,fontSize:13,fontFamily:'inherit',cursor:'pointer'}}>Re-read text</button>
                  : <button onClick={()=>setEditing(true)} style={{height:40,padding:'0 14px',borderRadius:10,border:'none',background:t.accentBg,color:t.accent,fontWeight:700,fontSize:13,fontFamily:'inherit',cursor:'pointer'}}>Fix the text</button>}
              </div>
            </div>
          )}

          {phase==='review' && (
            <>
              <div style={{display:'flex',flexDirection:'column'}}>
                {result.changes.map((c,i)=>{
                  const on = !!picked[c.key];
                  const from = fmtVal(c, c.from, stamps), to = fmtVal(c, c.to, stamps);
                  return (
                    <button key={c.key} onClick={()=>setPicked({...picked,[c.key]:!on})} aria-pressed={on}
                      style={{display:'flex',gap:12,alignItems:'flex-start',textAlign:'left',padding:'12px 0',background:'none',border:'none',
                        borderTop:i?`1px solid ${t.border}`:'none',cursor:'pointer',fontFamily:'inherit',opacity:on?1:.5}}>
                      <div style={{width:26,height:26,borderRadius:8,flexShrink:0,marginTop:1,display:'flex',alignItems:'center',justifyContent:'center',
                        background:on?t.accent:'transparent',border:on?'none':`1.8px solid ${t.inputBorder}`}}>
                        {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke={t.onAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:t.sub,letterSpacing:.5}}>{c.type==='stamps'?'LOG NOW':c.label.toUpperCase()}</div>
                        {Array.isArray(to)
                          ? <ol style={{margin:'4px 0 0',paddingLeft:18,fontSize:15,fontWeight:600,color:t.text,lineHeight:1.5}}>{to.map((s,j)=><li key={j}>{s}</li>)}</ol>
                          : <div style={{fontSize:16,fontWeight:700,color:t.text,marginTop:2,textWrap:'pretty'}}>{to}</div>}
                        {c.type!=='stamps' && from!=='—' && (
                          <div style={{fontSize:12,color:t.sub,marginTop:3,textDecoration:'line-through',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {Array.isArray(from)?`${from.length} existing ${from.length===1?'step':'steps'}`:from}
                          </div>)}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{fontSize:12,color:result.via==='fallback'?t.danger:t.sub,marginTop:8,lineHeight:1.5}}>{viaNote}</div>
            </>
          )}

          {phase==='empty' && <div style={{fontSize:14,color:t.sub,lineHeight:1.5}}>Didn’t catch anything that matches this step’s fields. Try naming things directly — “16 pound brisket”, “target 205”.</div>}
          {phase==='error' && <div style={{fontSize:14,color:t.sub,lineHeight:1.5}}>Your transcript is kept. Retry when you’re back on Wi-Fi, or switch on Quick parse fallback in Settings.</div>}
        </div>

        <div style={{display:'flex',gap:10,padding:'12px 20px 18px'}}>
          {phase==='listening' && (
            <button onClick={()=>finish()} style={{...sheetBtn(true),height:64,display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontSize:17}}>
              <span style={{width:16,height:16,borderRadius:4,background:t.onAccent}}></span>Done talking
            </button>)}
          {phase==='review' && <>
            <button onClick={start} style={{...sheetBtn(false),flex:'0 0 auto',padding:'0 18px',display:'flex',alignItems:'center',gap:8}}><MicGlyph size={18} color={t.text}/>Redo</button>
            <button disabled={!chosen.length} onClick={()=>onApply(chosen, result.via)} style={{...sheetBtn(true),opacity:chosen.length?1:.4}}>
              Fill {chosen.length} {chosen.length===1?'field':'fields'}
            </button>
          </>}
          {(phase==='empty'||phase==='error') && <>
            <button onClick={onClose} style={sheetBtn(false)}>Cancel</button>
            <button onClick={phase==='error'?()=>finish(text):start} style={sheetBtn(true)}>{phase==='error'?'Retry':'Try again'}</button>
          </>}
        </div>
        <style>{`@keyframes vfBar{from{transform:scaleY(.15)}to{transform:scaleY(1)}}@keyframes vfSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}

function VoiceToast({ count, onUndo, onDone }) {
  const t = window.useTheme();
  React.useEffect(()=>{ const to = setTimeout(onDone, 6000); return ()=>clearTimeout(to); }, [count]);
  return (
    <div role="status" style={{position:'absolute',left:16,right:16,bottom:16,zIndex:25,height:60,borderRadius:16,background:t.text,color:t.bg,
      display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 8px 0 18px',boxShadow:t.shadowMd,animation:'fadeIn .18s ease'}}>
      <span style={{fontSize:15,fontWeight:600}}>Filled {count} {count===1?'field':'fields'} by voice</span>
      <button onClick={onUndo} style={{height:44,padding:'0 16px',borderRadius:11,border:'none',background:'transparent',color:t.bg,
        fontSize:15,fontWeight:800,fontFamily:'inherit',cursor:'pointer',textDecoration:'underline'}}>Undo</button>
    </div>
  );
}

/* ── Model downloads ──
   Finished downloads persist; in-flight ones pause when Wi-Fi drops
   and resume when it comes back. */
const ALL_MODELS = [...SPEECH_MODELS, ...LLM_MODELS];
const fmtMB = mb => mb >= 1000 ? `${(mb/1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
function useModelDownloads(initialReady) {
  const [dl, setDl] = React.useState(()=>{
    let ready = initialReady;
    try { const s = JSON.parse(localStorage.getItem('smartSmoker.models')||'null'); if (Array.isArray(s)) ready = s; } catch (e) {}
    return Object.fromEntries(ALL_MODELS.map(m=>[m.id, ready.includes(m.id)?{status:'ready',pct:100}:{status:'none',pct:0}]));
  });
  const [online, setOnline] = React.useState(navigator.onLine);
  React.useEffect(()=>{ const on=()=>setOnline(true), off=()=>setOnline(false);
    addEventListener('online',on); addEventListener('offline',off); return ()=>{removeEventListener('online',on);removeEventListener('offline',off);}; },[]);
  const active = Object.values(dl).some(d=>d.status==='downloading');
  React.useEffect(()=>{
    if (!active || !online) return;
    const iv = setInterval(()=>setDl(prev=>{
      const next = {...prev};
      Object.entries(prev).forEach(([id,d])=>{
        if (d.status!=='downloading') return;
        const mb = ALL_MODELS.find(m=>m.id===id).mb;
        const pct = Math.min(100, d.pct + Math.max(.6, 900/mb) * (0.6+Math.random()*0.8));
        next[id] = pct>=100 ? {status:'ready',pct:100} : {status:'downloading',pct};
      });
      return next;
    }), 250);
    return ()=>clearInterval(iv);
  },[active, online]);
  React.useEffect(()=>{
    try { localStorage.setItem('smartSmoker.models', JSON.stringify(Object.keys(dl).filter(k=>dl[k].status==='ready'))); } catch (e) {}
  },[dl]);
  const start  = id => setDl(p=>p[id].status==='ready'?p:{...p,[id]:{status:'downloading',pct:p[id].pct||0}});
  const cancel = id => setDl(p=>({...p,[id]:{status:'none',pct:0}}));
  const remove = cancel;
  return { dl, online, start, cancel, remove };
}

function ModelStatus({ model, d, online, onStart, onCancel, onRemove }) {
  const t = window.useTheme();
  const linkBtn = (label, onClick, color) => (
    <button onClick={onClick} style={{height:36,padding:'0 12px',marginRight:-8,borderRadius:9,border:'none',background:'transparent',
      color:color||t.accent,fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer',flexShrink:0}}>{label}</button>
  );
  if (d.status==='ready') return (
    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,minHeight:36}}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill={t.ok}/><path d="M7.5 12.5l3 3 6-6.5" stroke={t.surface} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span style={{flex:1,fontSize:13,color:t.text,fontWeight:600}}>Ready to use <span style={{color:t.sub,fontWeight:500}}>· {fmtMB(model.mb)} on phone</span></span>
      {linkBtn('Remove', onRemove, t.sub)}
    </div>
  );
  if (d.status==='downloading') {
    const paused = !online;
    return (
      <div style={{marginTop:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{flex:1,fontSize:13,fontWeight:600,color:paused?t.sub:t.text,fontVariantNumeric:'tabular-nums'}}>
            {paused ? 'Paused — waiting for Wi-Fi' : `Downloading ${Math.floor(d.pct)}%`}
            <span style={{color:t.sub,fontWeight:500}}> · {fmtMB(model.mb*d.pct/100)} of {fmtMB(model.mb)}</span>
          </span>
          {linkBtn('Cancel', onCancel, t.sub)}
        </div>
        <div role="progressbar" aria-valuenow={Math.floor(d.pct)} aria-valuemin="0" aria-valuemax="100" aria-label={`${model.name} download`}
          style={{height:6,borderRadius:3,background:t.surfaceAlt,overflow:'hidden',marginTop:4}}>
          <div style={{width:`${d.pct}%`,height:'100%',borderRadius:3,background:paused?t.sub:t.accent,transition:'width .25s linear'}}></div>
        </div>
      </div>
    );
  }
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,minHeight:36}}>
      <span style={{flex:1,fontSize:13,color:t.sub}}>Not downloaded · {fmtMB(model.mb)}</span>
      {linkBtn('Download', onStart)}
    </div>
  );
}

/* ── Settings card ── */
function VoiceSettingsCard({ voice, onVoice, models }) {
  const { useTheme, Card, Select } = window;
  const t = useTheme();
  const row = (key, label, list) => {
    const m = list.find(x=>x.id===voice[key]) || list[0];
    return (
      <div>
        <Select label={label} value={m.id} onChange={x=>{ onVoice(key,x); models.start(x); }}
          options={list.map(o=>({value:o.id,label:`${o.name}${models.dl[o.id].status==='ready'?'  ✓':''}`}))}/>
        <ModelStatus model={m} d={models.dl[m.id]} online={models.online}
          onStart={()=>models.start(m.id)} onCancel={()=>models.cancel(m.id)} onRemove={()=>models.remove(m.id)}/>
      </div>
    );
  };
  return (
    <Card style={{padding:'16px'}}>
      <div style={{fontSize:12,fontWeight:600,color:t.sub,letterSpacing:.4,marginBottom:12}}>VOICE FILL</div>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        {row('speech','Speech-to-text model',SPEECH_MODELS)}
        {row('llm','Field extraction model',LLM_MODELS)}
      </div>
    </Card>
  );
}

Object.assign(window, { useModelDownloads, ALL_MODELS, fmtMB, SPEECH_MODELS, LLM_MODELS, VOICE_DEFAULTS, VOICE_SCHEMAS, VoiceFab, VoiceSheet, VoiceToast, VoiceSettingsCard, useVoiceFlash, MicGlyph });
