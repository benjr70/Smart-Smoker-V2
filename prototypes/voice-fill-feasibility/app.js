// Voice Fill real-phone feasibility page (#691). Throwaway: measures whether
// the shortlisted on-device speech-to-text and LLM candidates load, how big and
// how fast they are, and whether a Ramble comes out as the right fields.

const $ = id => document.getElementById(id);
const log = (...a) => {
  const line = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  $('log').textContent = `${new Date().toLocaleTimeString()} ${line}\n` + $('log').textContent.slice(0, 20000);
  console.log(...a);
};
const mb = bytes => Math.round(bytes / 1048576);
const secs = ms => Math.round(ms / 100) / 10;
window.addEventListener('error', e => log('ERROR', e.message));
window.addEventListener('unhandledrejection', e => log('REJECTION', String(e.reason?.stack ?? e.reason)));

// ---------------------------------------------------------------- the Rambles

const SCRIPTS = {
  pre: "Okay, this one's the Sunday brisket. It's a brisket, twelve and a half pounds. I trimmed the fat cap down to a quarter inch, then rubbed it with salt and pepper, and it sat in the fridge overnight. Oh, and I injected it with beef broth this time, not sure if that will help.",
  smoke:
    "Chamber is the offset, running post oak. Probe one is the flat, probe two is the point, take both to two oh three. Probe three is the pork butt, pull that at one ninety-five. We're eating at six thirty and I want it to rest for forty-five minutes. Fire was a little hard to get going today.",
  post: "Wrapped it in butcher paper and rested it in the cooler for an hour and fifteen minutes. Then I sliced it against the grain and made burnt ends from the point. Bark was great but the flat was a touch dry.",
};

const EXPECTED = {
  pre: { name: 'Sunday brisket', meatType: 'brisket', weight: 12.5, weightUnit: 'LB', steps: ['trim fat cap to 1/4 inch', 'rub salt and pepper', 'fridge overnight', 'inject beef broth'], notes: 'unsure if the injection helps' },
  smoke: { chamberName: 'offset', woodType: 'post oak', probe1Name: 'flat', probe2Name: 'point', probe3Name: 'pork butt', probe1Target: 203, probe2Target: 203, probe3Target: 195, serveTime: '18:30', restMinutes: 45, notes: 'fire hard to get going' },
  post: { restTime: '01:15', steps: ['wrap in butcher paper', 'rest in cooler', 'slice against the grain', 'burnt ends from the point'], notes: 'bark great, flat a touch dry' },
};

const KEYTERMS = ['brisket', 'pork butt', 'spatchcock', 'tri-tip', 'burnt ends', 'hickory', 'mesquite', 'pecan', 'post oak', 'offset', 'butcher paper', 'fat cap', 'bark'];

// Provisional per-screen contract, only to have something to measure against.
// The real one is the "Per-screen extraction contract" ticket's to decide.
const nullable = type => ({ anyOf: [{ type }, { type: 'null' }] });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const SCHEMAS = {
  pre: obj({
    name: nullable('string'),
    meatType: nullable('string'),
    weight: nullable('number'),
    weightUnit: { anyOf: [{ type: 'string', enum: ['LB', 'OZ'] }, { type: 'null' }] },
    steps: { type: 'array', items: { type: 'string' } },
    notes: nullable('string'),
  }),
  smoke: obj({
    chamberName: nullable('string'),
    woodType: nullable('string'),
    probe1Name: nullable('string'),
    probe2Name: nullable('string'),
    probe3Name: nullable('string'),
    probe1Target: nullable('integer'),
    probe2Target: nullable('integer'),
    probe3Target: nullable('integer'),
    serveTime: nullable('string'),
    restMinutes: nullable('integer'),
    notes: nullable('string'),
  }),
  post: obj({
    restTime: nullable('string'),
    steps: { type: 'array', items: { type: 'string' } },
    notes: nullable('string'),
  }),
};

const FIELD_HELP = {
  pre: 'name: what the cook is called. meatType: the cut of meat. weight: number only. weightUnit: LB or OZ. steps: each prep step as a short phrase, in order. notes: anything else said, or anything you are unsure about.',
  smoke:
    'chamberName: name of the smoker chamber. woodType: wood being burned. probe1Name/probe2Name/probe3Name: what each probe is in. probe1Target/probe2Target/probe3Target: target temperature in degrees Fahrenheit as an integer ("two oh three" is 203, "one ninety-five" is 195). serveTime: when the food is served, 24-hour "HH:MM" (an evening meal at "six thirty" is "18:30"). restMinutes: rest duration in minutes. notes: anything else said, or anything you are unsure about.',
  post: 'restTime: how long the meat rested as "HH:MM" (an hour and fifteen minutes is "01:15"). steps: each post-smoke step as a short phrase, in order. notes: anything else said, or anything you are unsure about.',
};

const systemPrompt = screen =>
  `You fill in a barbecue smoking log from a spoken note. Reply with one JSON object and nothing else, matching this JSON schema:\n${JSON.stringify(SCHEMAS[screen])}\n` +
  `Fields: ${FIELD_HELP[screen]}\n` +
  'Use null for anything the note does not mention. Do not invent values. Keep names as spoken.';
const userPrompt = transcript => `Spoken note:\n"""${transcript}"""`;

// LiteRT-LM's tool schema is a JSON Schema subset with no unions: optional
// fields stand in for nullable ones.
function toolSchema(screen) {
  const properties = {};
  for (const [key, value] of Object.entries(SCHEMAS[screen].properties)) {
    const base = value.anyOf ? value.anyOf[0] : value;
    properties[key] = { ...base };
  }
  return { type: 'object', properties };
}

// ------------------------------------------------------------------ env probe

const env = { ua: navigator.userAgent };
async function probeEnv() {
  env.crossOriginIsolated = self.crossOriginIsolated;
  env.secureContext = self.isSecureContext;
  env.deviceMemoryGB = navigator.deviceMemory;
  env.cores = navigator.hardwareConcurrency;
  env.connection = navigator.connection ? { type: navigator.connection.type, effectiveType: navigator.connection.effectiveType } : null;
  try {
    const est = await navigator.storage.estimate();
    env.storage = { usageMB: mb(est.usage), quotaMB: mb(est.quota), persisted: await navigator.storage.persisted() };
  } catch (e) {
    env.storage = String(e);
  }
  try {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    env.webgpu = adapter
      ? {
          vendor: adapter.info?.vendor,
          architecture: adapter.info?.architecture,
          device: adapter.info?.device,
          description: adapter.info?.description,
          shaderF16: adapter.features.has('shader-f16'),
          maxBufferSizeMB: mb(adapter.limits.maxBufferSize),
          maxStorageBufferBindingSizeMB: mb(adapter.limits.maxStorageBufferBindingSize),
        }
      : 'no adapter';
  } catch (e) {
    env.webgpu = String(e);
  }
  // The browser-provided routes the research says are absent on Android: one
  // line each, because the map prefers them if a phone ever reports otherwise.
  const SR = self.SpeechRecognition ?? self.webkitSpeechRecognition;
  try {
    env.onDeviceSpeech = SR?.available ? await SR.available({ langs: ['en-US'], processLocally: true }) : 'no available()';
  } catch (e) {
    env.onDeviceSpeech = String(e);
  }
  try {
    env.promptApi = 'LanguageModel' in self ? await self.LanguageModel.availability() : 'absent';
  } catch (e) {
    env.promptApi = String(e);
  }
  $('env').textContent = JSON.stringify(env, null, 2);
}

async function storageMB() {
  try {
    return mb((await navigator.storage.estimate()).usage);
  } catch {
    return null;
  }
}

// Times a model load and reports how much browser storage it added. A second
// load of the same candidate adds ~0 MB and shows the from-cache load time.
async function timedLoad(statusEl, fn) {
  const before = await storageMB();
  const t0 = performance.now();
  let done = false;
  const timer = setInterval(async () => {
    const now = await storageMB();
    if (!done) statusEl.textContent = `loading… ${secs(performance.now() - t0)} s, +${now - before} MB stored`;
  }, 1000);
  try {
    const value = await fn();
    const loadS = secs(performance.now() - t0);
    const addedMB = (await storageMB()) - before;
    return { value, loadS, addedMB };
  } finally {
    done = true;
    clearInterval(timer);
  }
}

// ----------------------------------------------------------- speech-to-text

const tjs = () => import('@huggingface/transformers');

async function tjsAsr(model, device, dtype) {
  const { pipeline } = await tjs();
  const asr = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: p => p.status === 'done' && log('stt file', p.file),
  });
  return asr;
}

async function moonshine(arch) {
  const { Transcriber, ModelArch } = await import('@moonshine-ai/moonshine-wasm');
  const files = new Set();
  const transcriber = await Transcriber.load({
    language: 'en',
    modelArch: ModelArch[arch],
    onProgress: (loaded, total, file) => {
      if (!files.has(file)) {
        files.add(file);
        log('stt file', file, total ? `${mb(total)} MB` : '');
      }
    },
  });
  return transcriber;
}

const moonshineCandidate = (arch, label) => ({
  label,
  streaming: true,
  load: () => moonshine(arch),
  setKeyterms: (t, on) => t.setKeyterms(on ? KEYTERMS : []),
  batch: async (t, pcm) => t.transcribe(pcm, { sampleRate: 16000 }).lines.map(l => l.text).join(' '),
});
const whisperCandidate = (label, model, device, dtype, chunked) => ({
  label,
  load: () => tjsAsr(model, device, dtype),
  batch: async (asr, pcm) => (await asr(pcm, chunked ? { chunk_length_s: 30, stride_length_s: 5 } : {})).text,
});

const STT = {
  'moonshine-small-streaming': moonshineCandidate('SmallStreaming', 'Moonshine Small Streaming (moonshine-wasm, CPU, live)'),
  'moonshine-small-streaming-keyterms': { ...moonshineCandidate('SmallStreaming', 'Moonshine Small Streaming + key terms'), keyterms: true },
  'moonshine-tiny-streaming': moonshineCandidate('TinyStreaming', 'Moonshine Tiny Streaming (step down)'),
  'moonshine-medium-streaming': moonshineCandidate('MediumStreaming', 'Moonshine Medium Streaming (step up)'),
  'whisper-base-webgpu': whisperCandidate('Whisper base.en (transformers.js, WebGPU)', 'onnx-community/whisper-base.en', 'webgpu', { encoder_model: 'fp32', decoder_model_merged: 'q4' }, true),
  'whisper-base-wasm': whisperCandidate('Whisper base.en (transformers.js, WASM q8)', 'onnx-community/whisper-base.en', 'wasm', 'q8', true),
  'whisper-small-webgpu': whisperCandidate('Whisper small.en (transformers.js, WebGPU, step up)', 'onnx-community/whisper-small.en', 'webgpu', { encoder_model: 'fp32', decoder_model_merged: 'q4' }, true),
  'moonshine-base-webgpu': whisperCandidate('Moonshine Base (transformers.js, WebGPU)', 'onnx-community/moonshine-base-ONNX', 'webgpu', 'fp32', false),
  'moonshine-base-wasm': whisperCandidate('Moonshine Base (transformers.js, WASM q8)', 'onnx-community/moonshine-base-ONNX', 'wasm', 'q8', false),
  none: { label: 'none (type or paste the transcript)', load: async () => null },
};

// ---------------------------------------------------------------------- LLM

function parseJson(text) {
  const cleaned = String(text).replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const tjsLlm = (label, model, dtype, device = 'webgpu') => ({
  label,
  async load() {
    const { AutoTokenizer, AutoModelForCausalLM } = await tjs();
    const { StructuredOutputProcessor } = await import('@huggingface/transformers-structured-output');
    const tokenizer = await AutoTokenizer.from_pretrained(model);
    const net = await AutoModelForCausalLM.from_pretrained(model, {
      dtype,
      device,
      progress_callback: p => p.status === 'done' && log('llm file', p.file),
    });
    return { tokenizer, net, StructuredOutputProcessor };
  },
  async extract({ tokenizer, net, StructuredOutputProcessor }, screen, transcript) {
    const messages = [
      { role: 'system', content: systemPrompt(screen) },
      { role: 'user', content: userPrompt(transcript) },
    ];
    const inputs = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, enable_thinking: false });
    const promptTokens = inputs.input_ids.dims[1];
    const run = async constrained => {
      const output = await net.generate({
        ...inputs,
        max_new_tokens: 400,
        do_sample: false,
        ...(constrained ? { logits_processor: new StructuredOutputProcessor(tokenizer, { type: 'json_schema', json_schema: SCHEMAS[screen] }) } : {}),
      });
      const fresh = output.slice(null, [promptTokens, null]);
      return { text: tokenizer.batch_decode(fresh, { skip_special_tokens: true })[0], outTokens: fresh.dims[1] };
    };
    let result;
    let constrained = true;
    try {
      result = await run(true);
    } catch (e) {
      log('constrained generate failed, retrying unconstrained:', String(e));
      constrained = false;
      result = await run(false);
    }
    return { ...result, promptTokens, constrained };
  },
});

const webLlm = (label, modelId) => ({
  label,
  async load() {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    return CreateMLCEngine(modelId, { initProgressCallback: r => ($('llmStatus').textContent = r.text) });
  },
  async extract(engine, screen, transcript) {
    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt(screen) },
        { role: 'user', content: userPrompt(transcript) },
      ],
      temperature: 0,
      max_tokens: 400,
      response_format: { type: 'json_object', schema: JSON.stringify(SCHEMAS[screen]) },
      extra_body: { enable_thinking: false },
    });
    return {
      text: reply.choices[0].message.content,
      promptTokens: reply.usage?.prompt_tokens,
      outTokens: reply.usage?.completion_tokens,
      runtimeStats: reply.usage?.extra,
      constrained: true,
    };
  },
});

const LITERT_URL = 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm';
const liteRt = label => ({
  label,
  async load() {
    const { Engine } = await import('@litert-lm/core');
    // LiteRT-LM does not cache the model itself; keep it in the Cache API so a
    // reload does not pull 1.9 GB again.
    const cache = await caches.open('vf-litert');
    let hit = await cache.match(LITERT_URL);
    if (!hit) {
      await cache.add(LITERT_URL);
      hit = await cache.match(LITERT_URL);
    }
    const engine = await Engine.create({ model: await hit.blob(), mainExecutorSettings: { maxNumTokens: 4096 } });
    return engine;
  },
  async extract(engine, screen, transcript) {
    const viaTool = async () => {
      const chat = await engine.createConversation({
        preface: {
          messages: [{ role: 'system', content: `You fill in a barbecue smoking log from a spoken note by calling fill_fields once. ${FIELD_HELP[screen]} Leave out anything the note does not mention. Do not invent values.` }],
          tools: [{ type: 'function', function: { name: 'fill_fields', description: 'Record the fields the spoken note mentions.', parameters: toolSchema(screen) } }],
        },
        enableConstrainedDecoding: true,
      });
      const reply = await chat.sendMessage(userPrompt(transcript));
      const call = reply.tool_calls?.[0]?.function?.arguments;
      const bench = await chat.getBenchmarkInfo?.().catch(() => undefined);
      if (!call) throw new Error(`no tool call; reply was ${JSON.stringify(reply).slice(0, 300)}`);
      return { text: JSON.stringify(call), constrained: true, runtimeStats: bench };
    };
    const viaPrompt = async () => {
      const chat = await engine.createConversation({ preface: { messages: [{ role: 'system', content: systemPrompt(screen) }] } });
      const reply = await chat.sendMessage(userPrompt(transcript));
      const text = typeof reply.content === 'string' ? reply.content : (reply.content ?? []).map(c => c.text ?? '').join('');
      return { text, constrained: false };
    };
    try {
      return await viaTool();
    } catch (e) {
      log('LiteRT tool-call route failed, falling back to a plain prompt:', String(e));
      return viaPrompt();
    }
  },
});

const LLM = {
  'tjs-qwen35-2b': tjsLlm('Transformers.js + Qwen3.5-2B q4f16 (~1.3 GB)', 'onnx-community/Qwen3.5-2B-ONNX', 'q4f16'),
  'tjs-qwen3-17b': tjsLlm('Transformers.js + Qwen3-1.7B q4f16 (~1.4 GB)', 'onnx-community/Qwen3-1.7B-ONNX', 'q4f16'),
  'tjs-qwen35-08b': tjsLlm('Transformers.js + Qwen3.5-0.8B q4f16 (~0.6 GB, step down)', 'onnx-community/Qwen3.5-0.8B-ONNX', 'q4f16'),
  'tjs-qwen3-06b-wasm': tjsLlm('Transformers.js + Qwen3-0.6B q4 on CPU/WASM (fallback if WebGPU fails)', 'onnx-community/Qwen3-0.6B-ONNX', 'q4', 'wasm'),
  'webllm-qwen3-17b': webLlm('WebLLM + Qwen3-1.7B q4f16 (~0.9 GB)', 'Qwen3-1.7B-q4f16_1-MLC'),
  'webllm-qwen35-2b': webLlm('WebLLM + Qwen3.5-2B q4f16 (~1.0 GB)', 'Qwen3.5-2B-q4f16_1-MLC'),
  'webllm-qwen35-08b': webLlm('WebLLM + Qwen3.5-0.8B q4f16 (~0.4 GB, step down)', 'Qwen3.5-0.8B-q4f16_1-MLC'),
  'litert-gemma4-e2b': liteRt('LiteRT-LM JS + Gemma 4 E2B (1.9 GB)'),
  none: { label: 'none (speech-to-text only)', load: async () => null },
};

// ------------------------------------------------------- recordings (IndexedDB)

const db = new Promise((resolve, reject) => {
  const open = indexedDB.open('vf-feasibility', 1);
  open.onupgradeneeded = () => open.result.createObjectStore('pcm');
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => reject(open.error);
});
const idb = async (mode, fn) => {
  const store = (await db).transaction('pcm', mode).objectStore('pcm');
  return new Promise((resolve, reject) => {
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
const savePcm = (screen, pcm) => idb('readwrite', s => s.put(pcm, screen));
const loadPcm = screen => idb('readonly', s => s.get(screen));

// --------------------------------------------------------------------- state

const state = { stt: null, sttKey: null, sttLoad: null, llm: null, llmKey: null, llmLoad: null, last: null };
let capture = null;

function fill(select, table, saved) {
  for (const [key, c] of Object.entries(table)) select.add(new Option(c.label, key));
  if (saved && table[saved]) select.value = saved;
}
const remember = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const recall = k => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

async function loadStt() {
  const key = $('sttPick').value;
  remember('vf-stt', key);
  $('sttLoad').disabled = true;
  try {
    const r = await timedLoad($('sttStatus'), () => STT[key].load());
    state.stt = r.value;
    state.sttKey = key;
    state.sttLoad = { loadS: r.loadS, addedMB: r.addedMB };
    if (STT[key].setKeyterms) STT[key].setKeyterms(state.stt, !!STT[key].keyterms);
    $('sttStatus').textContent = `loaded in ${r.loadS} s, +${r.addedMB} MB stored`;
    report({ kind: 'load', half: 'stt', candidate: key, ...state.sttLoad });
  } catch (e) {
    $('sttStatus').textContent = `FAILED: ${e}`;
    log('stt load failed', String(e?.stack ?? e));
    report({ kind: 'load-failed', half: 'stt', candidate: key, error: String(e) });
    $('sttLoad').disabled = false;
  }
}

async function loadLlm() {
  const key = $('llmPick').value;
  remember('vf-llm', key);
  $('llmLoad').disabled = true;
  try {
    const r = await timedLoad($('llmStatus'), () => LLM[key].load());
    state.llm = r.value;
    state.llmKey = key;
    state.llmLoad = { loadS: r.loadS, addedMB: r.addedMB };
    $('llmStatus').textContent = `loaded in ${r.loadS} s, +${r.addedMB} MB stored`;
    report({ kind: 'load', half: 'llm', candidate: key, ...state.llmLoad });
  } catch (e) {
    $('llmStatus').textContent = `FAILED: ${e}`;
    log('llm load failed', String(e?.stack ?? e));
    report({ kind: 'load-failed', half: 'llm', candidate: key, error: String(e) });
    $('llmLoad').disabled = false;
  }
}

// Captures 16 kHz mono PCM. A streaming recogniser is fed while the user is
// still talking, which is the whole point of it; everything else transcribes
// the finished clip.
async function startRecording() {
  const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.resume();
  const source = ctx.createMediaStreamSource(media);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  const live = state.stt && STT[state.sttKey].streaming ? liveSession() : null;
  node.onaudioprocess = e => {
    const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(chunk);
    live?.feed(chunk);
  };
  source.connect(node);
  node.connect(ctx.destination);
  capture = { media, ctx, source, node, chunks, live, t0: performance.now() };
  $('rec').textContent = '■ Stop';
  $('recStatus').textContent = 'recording…';
}

function liveSession() {
  const stream = state.stt.createStream();
  const lines = new Map();
  let busyMs = 0;
  const show = () => ($('transcript').value = [...lines.values()].join(' '));
  stream.addListener({
    onLineTextChanged: e => (lines.set(e.line.id, e.line.text), show()),
    onLineCompleted: e => (lines.set(e.line.id, e.line.text), show()),
  });
  stream.start();
  return {
    feed(chunk) {
      const t = performance.now();
      stream.addAudio(chunk, 16000);
      stream.transcribe();
      busyMs += performance.now() - t;
    },
    finish() {
      const t = performance.now();
      stream.stop();
      const final = stream.transcribe();
      busyMs += performance.now() - t;
      const text = (final?.lines?.length ? final.lines.map(l => l.text) : [...lines.values()]).join(' ');
      stream.close();
      return { text, busyMs };
    },
  };
}

async function stopRecording() {
  const c = capture;
  capture = null;
  const stoppedAt = performance.now();
  c.node.disconnect();
  c.source.disconnect();
  c.media.getTracks().forEach(t => t.stop());
  $('rec').textContent = '● Record';
  const pcm = new Float32Array(c.chunks.reduce((n, x) => n + x.length, 0));
  let offset = 0;
  for (const chunk of c.chunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }
  const screen = $('screen').value;
  savePcm(screen, pcm).catch(e => log('could not save recording', String(e)));
  c.ctx.close();
  await pipeline({ screen, pcm, stoppedAt, live: c.live });
}

// Everything that happens between the Ramble ending and the fields appearing.
async function pipeline({ screen, pcm, stoppedAt, live, transcriptOnly }) {
  const run = { kind: 'run', screen, stt: state.sttKey, llm: state.llmKey, sttLoad: state.sttLoad, llmLoad: state.llmLoad };
  $('total').textContent = '';
  $('fields').textContent = '';
  let transcript = $('transcript').value;
  try {
    if (!transcriptOnly && pcm) {
      run.audioS = secs((pcm.length / 16000) * 1000);
      if (state.stt) {
        $('recStatus').textContent = 'transcribing…';
        await new Promise(r => setTimeout(r, 30));
        const t0 = performance.now();
        if (live) {
          const done = live.finish();
          transcript = done.text;
          run.sttMode = 'live';
          run.sttBusyS = secs(done.busyMs);
          run.sttKeepsPace = done.busyMs < (pcm.length / 16000) * 1000;
        } else {
          transcript = await STT[state.sttKey].batch(state.stt, pcm);
          run.sttMode = 'batch';
        }
        run.sttAfterStopS = secs(performance.now() - t0);
        if (run.sttMode === 'batch') run.sttRealTimeFactor = Math.round((run.audioS / run.sttAfterStopS) * 10) / 10;
        $('transcript').value = transcript;
      }
    }
    run.transcript = transcript;
    if (state.llm && transcript.trim()) {
      $('recStatus').textContent = 'extracting…';
      await new Promise(r => setTimeout(r, 30));
      const t0 = performance.now();
      const out = await LLM[state.llmKey].extract(state.llm, screen, transcript);
      run.llmS = secs(performance.now() - t0);
      run.llmRaw = out.text;
      run.fields = parseJson(out.text);
      run.validJson = run.fields !== null;
      run.constrained = out.constrained;
      run.promptTokens = out.promptTokens;
      run.outTokens = out.outTokens;
      run.runtimeStats = out.runtimeStats;
      $('fields').textContent = `got:\n${JSON.stringify(run.fields ?? out.text, null, 2)}\n\nexpected (roughly):\n${JSON.stringify(EXPECTED[screen], null, 2)}`;
    }
    if (stoppedAt) {
      run.endOfRambleToFieldsS = secs(performance.now() - stoppedAt);
      const pass = run.endOfRambleToFieldsS <= 15;
      $('total').textContent = `Ramble end → ${state.llm ? 'fields' : 'transcript'}: ${run.endOfRambleToFieldsS} s ${state.llm ? (pass ? '✓ under 15 s' : '✗ over 15 s') : ''}`;
    }
    $('recStatus').textContent = `speech ${run.sttAfterStopS ?? '–'} s after stop (${run.sttMode ?? 'none'}), LLM ${run.llmS ?? '–'} s`;
  } catch (e) {
    run.error = String(e?.stack ?? e);
    $('recStatus').textContent = `FAILED: ${e}`;
    log('pipeline failed', run.error);
  }
  state.last = run;
  log('run', run);
}

// ------------------------------------------------------------------- results

const results = () => JSON.parse(recall('vf-results') ?? '[]');
function report(row) {
  const full = { at: new Date().toISOString(), device: $('device').value, ...row };
  const all = [...results(), full];
  remember('vf-results', JSON.stringify(all));
  showResults();
  return fetch('/result', { method: 'POST', body: JSON.stringify(full) }).then(
    r => r.ok,
    () => false,
  );
}
function showResults() {
  $('results').textContent = results()
    .map(r =>
      r.kind === 'run'
        ? `${r.device} | ${r.screen} | ${r.stt} + ${r.llm} | end→fields ${r.endOfRambleToFieldsS ?? '–'} s (stt ${r.sttAfterStopS ?? '–'}, llm ${r.llmS ?? '–'}) | transcript ${r.verdictTranscript}, fields ${r.verdictFields}${r.note ? ' | ' + r.note : ''}`
        : r.kind === 'env'
          ? `${r.device} | env sent`
          : `${r.device} | ${r.kind} ${r.half} ${r.candidate} ${r.loadS ?? ''} s +${r.addedMB ?? '?'} MB ${r.error ?? ''}`,
    )
    .join('\n');
}

// --------------------------------------------------------------------- wiring

fill($('sttPick'), STT, recall('vf-stt'));
fill($('llmPick'), LLM, recall('vf-llm'));
$('device').value = recall('vf-device') ?? $('device').value;
$('device').onchange = () => remember('vf-device', $('device').value);
const showScript = () => ($('script').textContent = SCRIPTS[$('screen').value]);
$('screen').onchange = showScript;
showScript();
showResults();

$('sttLoad').onclick = loadStt;
$('llmLoad').onclick = loadLlm;
$('rec').onclick = () => (capture ? stopRecording() : startRecording()).catch(e => (($('recStatus').textContent = `FAILED: ${e}`), log(String(e?.stack ?? e))));
$('rerun').onclick = async () => {
  const screen = $('screen').value;
  const pcm = await loadPcm(screen);
  if (!pcm) return void ($('recStatus').textContent = 'no saved recording for this screen yet');
  await pipeline({ screen, pcm, stoppedAt: performance.now() });
};
$('extract').onclick = () => pipeline({ screen: $('screen').value, transcriptOnly: true, stoppedAt: performance.now() });
$('save').onclick = async () => {
  if (!state.last) return void ($('saveStatus').textContent = 'nothing to save yet');
  const sent = await report({ ...state.last, verdictTranscript: $('vT').value, verdictFields: $('vF').value, note: $('vNote').value });
  $('saveStatus').textContent = sent ? 'saved and sent' : 'saved on this phone only (server unreachable): use Copy all';
  $('vNote').value = '';
};
$('copy').onclick = () => navigator.clipboard.writeText(JSON.stringify({ env, results: results() }, null, 2)).then(() => ($('saveStatus').textContent = 'copied'));
$('clear').onclick = () => (remember('vf-results', '[]'), showResults());

probeEnv().then(() => {
  navigator.storage.persist?.();
  if (!recall(`vf-env-sent-${$('device').value}`)) {
    report({ kind: 'env', env }).then(ok => ok && remember(`vf-env-sent-${$('device').value}`, '1'));
  }
});

// Debug handle for driving the page from DevTools.
window.vf = { state, STT, LLM, liveSession, pipeline, savePcm, loadPcm };
