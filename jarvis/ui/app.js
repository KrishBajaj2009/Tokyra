import { KnowledgeGraph } from './graph.js';
import { colorForType } from './graph-core.js';

const $ = id => document.getElementById(id);
let data, graph, currentId = null, traceArmed = false, requestVersion = 0, statusTimer;
let activeTypes = new Set();
const notice = message => { $('app-status').textContent = message; clearTimeout(statusTimer); statusTimer = setTimeout(() => { $('app-status').textContent = ''; }, 6000); };
const displayType = type => type.charAt(0).toUpperCase() + type.slice(1);

async function getJSON(url) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Could not load the local index (HTTP ${response.status}).`);
  return response.json();
}

function overlay(message, retry = false) {
  const panel = $('graph-overlay'); panel.replaceChildren(); panel.hidden = false;
  const text = document.createElement('p'); text.textContent = message; panel.append(text);
  if (retry) { const button = document.createElement('button'); button.textContent = 'Try again'; button.addEventListener('click', () => location.reload()); panel.append(button); }
}

function noteButton(node) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'hub-button';
  button.dataset.nodeId = node.id; button.style.setProperty('--node-color', colorForType(node.type));
  button.setAttribute('aria-label', `${node.title}, ${node.degree} connections`);
  const dot = document.createElement('span'); dot.className = 'hub-dot'; dot.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span'); title.className = 'hub-name'; title.textContent = node.title;
  const count = document.createElement('span'); count.className = 'hub-degree'; count.textContent = node.degree;
  button.append(dot, title, count); button.addEventListener('click', event => chooseNode(node.id, event.shiftKey, true));
  return button;
}

function renderHubs() {
  const list = $('hub-list'); list.replaceChildren();
  for (const node of [...data.nodes].filter(node => activeTypes.has(node.type)).sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title)).slice(0, 10)) {
    const li = document.createElement('li'); li.append(noteButton(node)); list.append(li);
  }
  if (!list.children.length) { const li = document.createElement('li'); li.className = 'placeholder'; li.textContent = 'No layers selected.'; list.append(li); }
  highlightSelection();
}

function renderSearch() {
  const query = $('note-search').value.trim().toLocaleLowerCase(), list = $('search-results');
  list.replaceChildren(); list.hidden = !query;
  if (!query) return;
  const matches = data.nodes.filter(node => activeTypes.has(node.type) && `${node.title} ${node.relative_path}`.toLocaleLowerCase().includes(query));
  for (const node of matches.slice(0, 30)) list.append(noteButton(node));
  if (!matches.length) { const empty = document.createElement('p'); empty.className = 'placeholder'; empty.textContent = 'No matching notes in the visible layers.'; list.append(empty); }
  highlightSelection();
}

function highlightSelection() {
  document.querySelectorAll('[data-node-id]').forEach(button => {
    const selected = button.dataset.nodeId === currentId;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
  });
}

function updateFilters() {
  graph?.applyFilters(activeTypes); renderHubs(); renderSearch();
  document.querySelectorAll('[data-layer]').forEach(input => { input.checked = activeTypes.has(input.dataset.layer); });
  $('toggle-all').textContent = activeTypes.size ? 'Hide all' : 'Show all';
  if (!activeTypes.size) overlay('All layers are hidden. Select a layer to bring its notes back.');
  else if (data.nodes.length) $('graph-overlay').hidden = true;
}

function renderFilters() {
  const list = $('type-filters'); list.replaceChildren();
  for (const [type, count] of Object.entries(data.counts_by_type)) {
    const label = document.createElement('label'); label.className = 'filter-row'; label.style.setProperty('--node-color', colorForType(type));
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.dataset.layer = type;
    input.addEventListener('change', () => { input.checked ? activeTypes.add(type) : activeTypes.delete(type); updateFilters(); });
    const dot = document.createElement('span'); dot.className = 'filter-dot'; dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = displayType(type);
    const number = document.createElement('span'); number.className = 'filter-count'; number.textContent = count;
    label.append(input, dot, text, number); list.append(label);
  }
  $('type-count').textContent = `${activeTypes.size} types`;
}

function clearSelection() {
  currentId = null; requestVersion++; traceArmed = false; graph?.select(null);
  $('note-detail').hidden = true; $('inspector-empty').hidden = false; clearPath(); highlightSelection();
}

function clearPath() { traceArmed = false; graph?.clearPath(); $('path-banner').hidden = true; $('trace-from').textContent = 'Trace a connection ↗'; }

function showPath(path, source, target) {
  traceArmed = false; $('path-banner').hidden = false; $('trace-from').textContent = 'Trace a connection ↗';
  $('path-message').textContent = path.length ? `${path.length - 1} ${path.length === 2 ? 'connection' : 'connections'} · ${path.map(id => data.nodes.find(node => node.id === id)?.title || 'Unknown note').join(' → ')}` : `No path in current filters: ${source?.title || 'source'} → ${target?.title || 'target'}.`;
}

function addLinkedText(element, text, node) {
  const regex = /\[\[([^\]\n]+)\]\]/g;
  let from = 0;
  for (const match of text.matchAll(regex)) {
    element.append(document.createTextNode(text.slice(from, match.index)));
    const [raw, alias] = match[1].split('|'), target = raw.split('#')[0].trim();
    const candidates = data.nodes.filter(other => other.source_id === node.source_id &&
      (other.title.toLocaleLowerCase() === target.toLocaleLowerCase() || other.relative_path.replace(/\.(md|markdown|txt|pdf)$/i, '').toLocaleLowerCase() === target.toLocaleLowerCase()));
    const unresolved = data.unresolved_links.some(link => link.source_id === node.id && link.target === raw);
    if (candidates.length === 1 && !unresolved) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'wiki-link'; button.textContent = alias || raw;
      button.addEventListener('click', event => chooseNode(candidates[0].id, event.shiftKey, true)); element.append(button);
    } else { const span = document.createElement('span'); span.className = 'unresolved-link'; span.textContent = alias || raw; span.title = 'Use the note explorer to locate this reference.'; element.append(span); }
    from = match.index + match[0].length;
  }
  element.append(document.createTextNode(text.slice(from)));
}

function renderNote(node) {
  const content = $('note-content'); content.replaceChildren();
  let body = node.content.replace(/^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*\r?\n/, '');
  body = body.replace(/^\s*#\s+[^\n]+\n?/, '');
  // Render source content as text nodes; never evaluate HTML, markdown code or instructions.
  for (const paragraph of body.trim().split(/\n\s*\n/)) {
    const p = document.createElement('p');
    if (/FICTIONAL DEMO|SIMULATED, not measured/.test(paragraph)) p.className = 'note-disclaimer';
    addLinkedText(p, paragraph, node); content.append(p);
  }
  if (!body.trim()) content.textContent = 'This note has no text content.';
}

async function chooseNode(id, shifted = false, center = false) {
  const node = data.nodes.find(item => item.id === id); if (!node) return;
  if (!activeTypes.has(node.type)) { activeTypes.add(node.type); updateFilters(); }
  if ((shifted || traceArmed) && currentId && id !== currentId && graph) { graph.trace(id); return; }
  currentId = id; clearPath(); graph?.select(id, { center }); highlightSelection();
  $('inspector-empty').hidden = true; $('note-detail').hidden = false;
  $('note-title').textContent = node.title; $('note-path').textContent = node.path;
  $('note-type').textContent = node.type; $('note-type').style.setProperty('--node-color', colorForType(node.type));
  $('note-degree').textContent = `${node.degree} connections`; $('note-content').textContent = 'Opening note…';
  const version = ++requestVersion;
  try { const detail = await getJSON(`/api/note?id=${encodeURIComponent(id)}`); if (version === requestVersion) renderNote(detail); }
  catch (error) { if (version === requestVersion) $('note-content').textContent = error.message; }
}

function renderDiagnostics() {
  const notices = [...data.warnings, ...data.unresolved_links.map(link => `Unresolved link in ${link.path}: ${link.target} (${link.reason})`),
    ...Object.entries(data.skipped).map(([reason, count]) => `Skipped ${count}: ${reason.replaceAll('_', ' ')}`)];
  if (!notices.length) return;
  $('index-diagnostics').hidden = false; $('diagnostics-label').textContent = `${notices.length} index notices`;
  for (const text of notices) { const li = document.createElement('li'); li.textContent = text; $('diagnostics-list').append(li); }
}

async function initialize() {
  try {
    data = await getJSON('/api/index');
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('The local index response is invalid.');
    activeTypes = new Set(Object.keys(data.counts_by_type));
    $('mode-badge').textContent = data.mode === 'fictional demo' ? 'Demo mode' : 'Read-only mode';
    $('index-number').textContent = String(data.nodes.length).padStart(3, '0');
    if (data.mode !== 'fictional demo') { $('data-note-title').textContent = 'Your files, read-only'; $('data-note-copy').textContent = 'Notes stay on this computer. The index never changes your source files.'; }
    renderFilters(); renderHubs(); renderDiagnostics();
    try {
      graph = new KnowledgeGraph($('graph'), {
        select: chooseNode, hiddenSelection: clearSelection, path: showPath,
        counts: (nodes, edges) => { $('visible-count').textContent = nodes; $('edge-count').textContent = edges; $('visible-label').textContent = nodes === data.nodes.length ? 'notes' : `of ${data.nodes.length} notes`; },
        zoom: scale => { $('zoom-value').textContent = `${Math.round(scale * 100)}%`; },
        hover: (node, point) => { const tooltip = $('graph-tooltip'); tooltip.hidden = !node;
          if (node) { tooltip.textContent = `${node.title} · ${node.degree} connections`; tooltip.style.left = `${Math.max(0, Math.min(point.x + 15, $('graph').clientWidth - 240))}px`; tooltip.style.top = `${Math.max(0, Math.min(point.y - 40, $('graph').clientHeight - 60))}px`; }
        },
      });
      graph.setData(data); $('graph-overlay').hidden = true;
      if (!data.nodes.length) overlay('No readable notes were found. Check your configured folders and index notices.');
    } catch (error) { overlay(error.message); notice('The graph is unavailable. You can still open notes from the explorer.'); }
    if (data.top_hubs.length) chooseNode(data.top_hubs[0].id);
    $('note-search').addEventListener('input', renderSearch);
    $('toggle-all').addEventListener('click', () => { activeTypes = activeTypes.size ? new Set() : new Set(Object.keys(data.counts_by_type)); updateFilters(); });
    $('zoom-in').addEventListener('click', () => graph?.zoom(1.2)); $('zoom-out').addEventListener('click', () => graph?.zoom(1 / 1.2));
    $('reset-view').addEventListener('click', () => { graph?.fit(); notice('Graph fitted to view.'); });
    $('clear-selection').addEventListener('click', clearSelection); $('clear-path').addEventListener('click', clearPath);
    $('trace-from').addEventListener('click', () => { if (!currentId || !graph) return; traceArmed = true; $('path-banner').hidden = false; $('path-message').textContent = 'Choose a second note on the graph or in the explorer to trace its connection.'; $('trace-from').textContent = 'Choose a second note…'; $('note-search').focus(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { clearPath(); $('note-search').blur(); }
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('note-search').focus(); }
    });
    window.addEventListener('jarvis:select-note', event => chooseNode(event.detail, false, true));
    registerGraphTools();
  } catch (error) { $('mode-badge').textContent = 'Index unavailable'; overlay(`${error.message} Check that the JARVIS server is running.`, true); $('hub-list').textContent = 'Could not load notes.'; }
}

initialize();

function registerGraphTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const tools = [
    { name: 'read_jarvis_graph_state', title: 'Read JARVIS graph state', description: 'Read the current selected note, visible layers and graph counts. Does not return note contents.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input) {
      if (!input || Object.keys(input).length) throw new Error('No arguments are accepted.');
      return { selectedId: currentId, types: [...activeTypes], totalNotes: data.nodes.length, visibleNotes: graph?.visible.nodes.length || 0 };
    } },
    { name: 'focus_jarvis_note', title: 'Focus a JARVIS note', description: 'Select an existing note by its exact ID and show its inspector. This changes the visible page selection only.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, async execute(input) {
      if (!input || typeof input.id !== 'string' || Object.keys(input).some(key => key !== 'id') || !data.nodes.some(node => node.id === input.id)) throw new Error('Choose an existing note ID.');
      await chooseNode(input.id, false, true); return { selectedId: currentId };
    } }
  ];
  for (const tool of tools) {
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => console.warn('Optional browser graph tools are unavailable.')); }
    catch { console.warn('Optional browser graph tools are unavailable.'); }
  }
}
