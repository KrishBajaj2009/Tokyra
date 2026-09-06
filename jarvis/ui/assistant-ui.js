import { VoiceController } from './voice-client.js';
const $ = id => document.getElementById(id);
let status, csrf, busy = false, requestEpoch = 0;
let session = sessionStorage.getItem('jarvis-session');
if (!session) { session = crypto.randomUUID(); sessionStorage.setItem('jarvis-session', session); }

async function refreshStatus() {
  const response = await fetch('/api/status', { cache: 'no-store' });
  if (!response.ok) throw new Error('The local server is unavailable. Restart JARVIS and refresh this page.');
  status = await response.json(); csrf = status.csrf;
  $('model-status').textContent = status.api_enabled && status.model_configured ? 'GROQ CONNECTED' : 'MODEL OFFLINE';
  $('voice-status').textContent = status.voice_ready ? 'ElevenLabs voice ready' : 'Add an ElevenLabs key to jarvis/.env to enable voice.';
  return status;
}

async function request(path, body, audio = false) {
  if (!csrf) await refreshStatus();
  const response = await fetch(path, { method: 'POST', headers: { 'X-Jarvis-Token': csrf,
    'Content-Type': body instanceof Blob ? body.type : 'application/json' }, body: body instanceof Blob ? body : JSON.stringify(body) });
  if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || `Request failed (${response.status}).`); }
  return audio ? response.blob() : response.json();
}

function showError(message) { $('assistant-error').textContent = message; $('assistant-error').hidden = false; }
function clearError() { $('assistant-error').hidden = true; $('assistant-error').textContent = ''; }
function openConversation() { $('conversation-panel').hidden = false; }
function addMessage(role, text) {
  const item = document.createElement('article'); item.className = `message message-${role}`;
  const label = document.createElement('span'); label.className = 'message-role'; label.textContent = role === 'user' ? 'YOU' : 'JARVIS';
  const content = document.createElement('p'); content.textContent = text;
  item.append(label, content); $('message-list').append(item); item.scrollIntoView({ block: 'nearest' }); return item;
}

function cardElement(card) {
  const item = document.createElement('section'); item.className = 'tool-card';
  const heading = document.createElement('h4'); heading.textContent = card.title; item.append(heading);
  if (card.demo) { const tag = document.createElement('span'); tag.className = 'card-demo'; tag.textContent = 'FICTIONAL DEMO'; item.append(tag); }
  for (const key of ['text', 'fact', 'note', 'qualifier', 'overdue']) if (card[key]) {
    const p = document.createElement('p'); p.textContent = String(card[key]); item.append(p);
  }
  if (card.file) { const source = document.createElement('small'); source.textContent = card.file; item.append(source); }
  for (const source of card.sources || card.items || []) {
    const section = document.createElement('div'); section.className = 'card-source';
    const title = document.createElement(source.id ? 'button' : source.url ? 'a' : 'strong'); title.textContent = source.title || source.file || 'Source';
    if (source.id) { title.type = 'button'; title.addEventListener('click', () => { $('conversation-panel').hidden = true; window.dispatchEvent(new CustomEvent('jarvis:select-note', { detail: source.id })); }); }
    if (source.url) { try { const url = new URL(source.url); if (['https:', 'http:'].includes(url.protocol)) { title.href = url.href; title.target = '_blank'; title.rel = 'noopener noreferrer'; } } catch {} }
    section.append(title);
    if (source.file) { const file = document.createElement('small'); file.textContent = source.file; section.append(file); }
    if (source.excerpt || source.reason) { const p = document.createElement('p'); p.textContent = source.excerpt || source.reason; section.append(p); }
    item.append(section);
  }
  return item;
}

function renderReply(reply) {
  const message = addMessage('assistant', reply.spoken);
  for (const card of reply.cards || []) message.append(cardElement(card));
  $('model-status').textContent = reply.model?.startsWith('offline') ? 'MODEL OFFLINE · LOCAL FALLBACK' : 'GROQ + LOCAL TOOLS';
  if (reply.warning) showError(reply.warning);
  message.scrollIntoView({ block: 'nearest' });
}

function setBusy(value) { busy = value; $('send-message').disabled = value; $('ask-input').setAttribute('aria-busy', String(value)); }

const voice = new VoiceController({
  async checkReady() { const current = await refreshStatus(); if (!current.voice_ready) throw new Error('ElevenLabs voice is not configured. Add ELEVENLABS_API_KEY to jarvis/.env, then click the microphone again.'); },
  state(state, active) {
    document.documentElement.dataset.voiceState = state;
    $('core-state').textContent = ({ idle: 'Ready when you are', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' })[state];
    $('reactor-word').textContent = state.toUpperCase();
    $('mic-toggle').classList.toggle('active', active); $('mic-toggle').setAttribute('aria-pressed', String(active));
    $('mic-toggle').title = active ? 'Click to stop listening or interrupt speech' : 'Start a voice conversation';
  },
  level(level) { document.querySelectorAll('.audio-bars i').forEach((bar, i) => { bar.style.height = `${3 + level * (12 + (i % 3) * 7)}px`; }); },
  caption(text) { $('live-caption').textContent = text; },
  error: showError,
  transcribe: blob => request('/api/listen', blob),
  synthesize: text => request('/api/speak', { text }, true),
  transcript: text => sendMessage(text, true),
  interrupt() { requestEpoch++; setBusy(false); }
});

async function sendMessage(text, fromVoice = false) {
  if (busy || !text.trim()) return;
  clearError(); openConversation(); addMessage('user', text); setBusy(true);
  $('ask-input').value = ''; voice.pause(); const epoch = ++requestEpoch;
  try {
    const reply = await request('/api/chat', { text, session });
    if (epoch !== requestEpoch) return;
    renderReply(reply);
    if (status.voice_ready && !voice.muted) await voice.speak(reply.spoken);
    else { voice.setState('idle'); if (reply.cards?.some(card => card.type === 'memory')) showError('Memory saved with the exact receipt above. Spoken confirmation is unavailable until ElevenLabs voice is configured.'); }
  } catch (error) { showError(error.message); voice.setState('idle'); }
  finally { if (epoch === requestEpoch) { setBusy(false); if (voice.active && !fromVoice) voice.resume(); } }
}

async function runTool(name, extra = {}) {
  if (busy) return;
  openConversation(); clearError(); setBusy(true); voice.pause();
  try {
    const reply = await request('/api/tool', { name, ...extra }); renderReply(reply);
    if (status.voice_ready && !voice.muted) await voice.speak(reply.spoken);
    else { voice.setState('idle'); if (name === 'remember') showError('Memory saved with the exact receipt above. Spoken confirmation is unavailable until voice is configured.'); }
  } catch (error) { showError(error.message); }
  finally { setBusy(false); voice.setState('idle'); if (voice.active) voice.resume(); }
}

async function setup() {
  try { await refreshStatus(); } catch (error) { showError(error.message); }
  $('ask-form').addEventListener('submit', event => { event.preventDefault(); sendMessage($('ask-input').value); });
  $('mic-toggle').addEventListener('click', () => { clearError(); voice.toggle(); });
  $('mute-toggle').addEventListener('click', () => { voice.setMuted(!voice.muted); $('mute-toggle').setAttribute('aria-pressed', String(voice.muted)); $('mute-toggle').textContent = voice.muted ? 'Unmute' : 'Mute'; });
  $('close-conversation').addEventListener('click', () => { $('conversation-panel').hidden = true; });
  $('brief-button').addEventListener('click', () => runTool('brief_me')); $('plan-button').addEventListener('click', () => runTool('plan_day'));
  $('memory-button').addEventListener('click', () => { $('memory-dialog').showModal(); $('memory-fact').focus(); });
  $('save-memory').addEventListener('click', () => { const fact = $('memory-fact').value.trim(); if (!fact) return; $('memory-dialog').close(); $('memory-fact').value = ''; runTool('remember', { fact }); });
  $('show-memories').addEventListener('click', async () => {
    $('memory-dialog').close(); openConversation();
    try { const response = await fetch('/api/memory'); const result = await response.json(); const message = addMessage('assistant', result.facts.length ? 'Here are your saved facts.' : 'You haven’t asked me to remember anything yet.');
      for (const fact of result.facts) message.append(cardElement({ title: fact.file, text: fact.text }));
    } catch (error) { showError(error.message); }
  });
  $('import-button').addEventListener('click', () => { $('import-dialog').showModal(); $('project-path').focus(); });
  $('preview-project').addEventListener('click', async () => {
    $('import-error').textContent = ''; $('import-confirm').hidden = true; $('preview-project').disabled = true;
    try {
      const preview = await request('/api/projects/preview', { path: $('project-path').value.trim() });
      $('project-preview').replaceChildren();
      const summary = document.createElement('p'); summary.textContent = `${preview.count} readable files in ${preview.path}`; $('project-preview').append(summary);
      const list = document.createElement('ul'); for (const sample of preview.samples) { const li = document.createElement('li'); li.textContent = sample; list.append(li); } $('project-preview').append(list);
      for (const warning of preview.warnings) { const p = document.createElement('p'); p.textContent = warning; $('project-preview').append(p); }
      $('import-confirm').hidden = !preview.count; $('import-confirm').dataset.token = preview.token;
      if (!preview.count) $('import-error').textContent = 'No supported files found. Choose a project containing source files or notes.';
    } catch (error) { $('import-error').textContent = error.message; }
    finally { $('preview-project').disabled = false; }
  });
  $('project-path').addEventListener('input', () => { $('import-confirm').hidden = true; $('project-preview').replaceChildren(); });
  $('import-confirm').addEventListener('click', async () => {
    $('import-confirm').disabled = true;
    try { await request('/api/projects/import', { token: $('import-confirm').dataset.token }); sessionStorage.removeItem('jarvis-session'); location.reload(); }
    catch (error) { $('import-error').textContent = error.message; $('import-confirm').disabled = false; }
  });
  $('switch-demo').addEventListener('click', async () => { try { await request('/api/projects/demo', {}); sessionStorage.removeItem('jarvis-session'); location.reload(); } catch (error) { $('import-error').textContent = error.message; } });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (voice.state === 'speaking' || voice.state === 'thinking')) voice.interrupt();
    if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); voice.toggle(); }
  });
  window.addEventListener('pagehide', () => voice.stop());
  const examples = ['What should I focus on today?', 'What connects pricing to product quality?', 'Which experiments need my attention?']; let example = 0;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { if (!document.hidden) $('ask-input').placeholder = examples[++example % examples.length]; }, 6500);
}
setup();
