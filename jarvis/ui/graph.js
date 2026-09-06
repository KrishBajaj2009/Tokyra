import { colorForType, makeNodes, visibleGraph, shortestPath, physicsStep, fitTransform, zoomAt, collisionGrid } from './graph-core.js';

export class KnowledgeGraph {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas is unavailable in this browser. You can still read notes in the explorer.');
    this.callbacks = callbacks; this.nodes = []; this.edges = []; this.types = new Set();
    this.visible = visibleGraph([], [], this.types); this.view = { x: 0, y: 0, scale: 1 };
    this.selected = null; this.hover = null; this.path = []; this.destination = null;
    this.alpha = 0; this.interacted = false; this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas);
    this.bind(); this.resize(); this.lastDraw = 0; this.lastPulse = 0;
    this.frame = requestAnimationFrame(time => this.animate(time));
  }
  setData(data) {
    this.nodes = makeNodes(data.nodes); this.edges = data.edges;
    this.types = new Set(this.nodes.map(node => node.type));
    this.allById = new Map(this.nodes.map(node => [node.id, node]));
    for (let i = 0; i < (this.nodes.length < 200 ? 100 : 25); i++) physicsStep(this.nodes, this.edges, .8);
    this.alpha = 1; this.applyFilters(this.types); this.fit();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width; this.height = rect.height; this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    this.fit();
  }
  applyFilters(types) {
    this.types = new Set(types); this.visible = visibleGraph(this.nodes, this.edges, this.types);
    this.hover = null; this.callbacks.hover?.(null);
    if (this.selected && !this.visible.byId.has(this.selected)) {
      this.selected = null; this.path = []; this.destination = null; this.callbacks.hiddenSelection?.();
    }
    if (this.destination && this.selected) this.trace(this.destination);
    else this.path = [];
    this.callbacks.counts?.(this.visible.nodes.length, this.visible.edges.length);
  }
  fit() {
    this.view = fitTransform(this.visible.nodes, this.width || 600, this.height || 600);
    this.interacted = false; this.callbacks.zoom?.(this.view.scale);
  }
  zoom(factor, x = this.width / 2, y = this.height / 2) {
    this.view = zoomAt(this.view, factor, x, y); this.interacted = true; this.callbacks.zoom?.(this.view.scale);
  }
  select(id, { center = false } = {}) {
    this.selected = id; this.clearPath();
    const node = this.visible.byId.get(id);
    if (center && node) { this.view.x = this.width / 2 - node.x * this.view.scale; this.view.y = this.height / 2 - node.y * this.view.scale; this.interacted = true; }
  }
  trace(id) {
    if (!this.selected) return;
    this.destination = id;
    this.path = shortestPath(this.visible.adjacency, this.selected, id) || [];
    this.callbacks.path?.(this.path, this.allById.get(this.selected), this.allById.get(id));
  }
  clearPath() { this.path = []; this.destination = null; }
  coordinates(event) { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  world(point) { return { x: (point.x - this.view.x) / this.view.scale, y: (point.y - this.view.y) / this.view.scale }; }
  hit(point) {
    const world = this.world(point);
    let hit = null, closest = Infinity;
    for (const node of this.visible.nodes) {
      const distance = Math.hypot(world.x - node.x, world.y - node.y);
      if (distance < node.radius + 7 / this.view.scale && distance < closest) { closest = distance; hit = node; }
    }
    return hit;
  }
  bind() {
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const point = this.coordinates(event), node = this.hit(point);
      this.gesture = { pointer: event.pointerId, start: point, previous: point, node, moved: false, shift: event.shiftKey };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      const point = this.coordinates(event), gesture = this.gesture;
      if (gesture && gesture.pointer === event.pointerId) {
        if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 5) gesture.moved = true;
        if (gesture.moved) {
          this.interacted = true; this.canvas.classList.add('dragging');
          if (gesture.node) { const world = this.world(point); Object.assign(gesture.node, world, { pinned: true, vx: 0, vy: 0 }); this.alpha = Math.max(this.alpha, .2); }
          else { this.view.x += point.x - gesture.previous.x; this.view.y += point.y - gesture.previous.y; }
        }
        gesture.previous = point; return;
      }
      const node = this.hit(point); this.hover = node?.id || null;
      this.canvas.classList.toggle('hovering', Boolean(node)); this.callbacks.hover?.(node, point);
    });
    const endGesture = (event, cancelled = false) => {
      const gesture = this.gesture;
      if (!gesture || event.pointerId !== gesture.pointer) return;
      this.gesture = null;
      if (gesture.node) gesture.node.pinned = false;
      this.canvas.classList.remove('dragging');
      if (!cancelled && !gesture.moved && gesture.node) this.callbacks.select?.(gesture.node.id, gesture.shift);
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    this.canvas.addEventListener('pointerup', event => endGesture(event));
    this.canvas.addEventListener('pointercancel', event => endGesture(event, true));
    this.canvas.addEventListener('lostpointercapture', event => endGesture(event, true));
    this.canvas.addEventListener('pointerleave', () => { if (!this.gesture) { this.hover = null; this.callbacks.hover?.(null); } });
    this.canvas.addEventListener('wheel', event => { event.preventDefault(); const point = this.coordinates(event); this.zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .002), point.x, point.y); }, { passive: false });
    this.canvas.addEventListener('keydown', event => {
      if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
      if (event.key === '+' || event.key === '=') this.zoom(1.2);
      else if (event.key === '-') this.zoom(1 / 1.2);
      else if (event.key === '0') this.fit();
      else if (event.key.startsWith('Arrow')) { this.interacted = true; const directions = { ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35] }; const delta = directions[event.key]; if (delta) { this.view.x += delta[0]; this.view.y += delta[1]; } }
    });
  }
  animate(time) {
    this.frame = requestAnimationFrame(next => this.animate(next));
    if (document.hidden || time - this.lastDraw < 30) return;
    this.lastDraw = time;
    if (this.alpha > .006) {
      physicsStep(this.nodes, this.edges, this.alpha); physicsStep(this.nodes, this.edges, this.alpha);
      this.alpha *= .98;
      if (!this.interacted && !this.gesture) { this.view = fitTransform(this.visible.nodes, this.width, this.height); this.callbacks.zoom?.(this.view.scale); }
    }
    this.draw(time);
  }
  draw(time) {
    const ctx = this.ctx, { x, y, scale } = this.view, width = this.width, height = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#718ca30e';
    for (let gx = 16; gx < width; gx += 30) for (let gy = 18; gy < height; gy += 30) { ctx.beginPath(); ctx.arc(gx, gy, .6, 0, Math.PI * 2); ctx.fill(); }
    const focus = this.hover || this.selected;
    const neighbors = this.visible.adjacency.get(focus) || new Set();
    const pathIds = new Set(this.path), pathEdges = new Set();
    for (let i = 1; i < this.path.length; i++) pathEdges.add([this.path[i - 1], this.path[i]].sort().join('|'));
    const point = node => ({ x: node.x * scale + x, y: node.y * scale + y });
    for (const edge of this.visible.edges) {
      const a = point(this.visible.byId.get(edge.source)), b = point(this.visible.byId.get(edge.target));
      const traced = pathEdges.has([edge.source, edge.target].sort().join('|'));
      const lit = edge.source === focus || edge.target === focus;
      ctx.globalAlpha = traced ? .95 : focus ? (lit ? .55 : .022) : .22;
      ctx.strokeStyle = traced ? '#a9edf8' : lit ? '#7eaabd' : '#597d94'; ctx.lineWidth = traced ? 1.8 : .8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (!this.reducedMotion && !focus && this.visible.edges.length) {
      if (time - this.lastPulse > 4500) { this.lastPulse = time; this.pulse = this.visible.edges[Math.floor(time / 4500) % this.visible.edges.length]; }
      const progress = (time - this.lastPulse) / 1800;
      if (this.pulse && progress < 1 && this.visible.byId.has(this.pulse.source) && this.visible.byId.has(this.pulse.target)) {
        const a = point(this.visible.byId.get(this.pulse.source)), b = point(this.visible.byId.get(this.pulse.target));
        ctx.globalAlpha = Math.sin(progress * Math.PI) * .8; ctx.fillStyle = '#b7eaf1';
        ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * progress, a.y + (b.y - a.y) * progress, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const node of [...this.visible.nodes].reverse()) {
      const p = point(node);
      if (p.x < -30 || p.x > width + 30 || p.y < -30 || p.y > height + 30) continue;
      const important = node.id === focus, relevant = important || neighbors.has(node.id) || pathIds.has(node.id);
      ctx.globalAlpha = focus ? (relevant ? 1 : .1) : .92;
      const breathe = this.reducedMotion ? 0 : Math.sin(time / 1900 + node.degree) * .22;
      const radius = Math.max(2.5, node.radius * Math.min(1.2, Math.max(.6, scale))) + breathe + (important ? 1.7 : 0);
      const color = colorForType(node.type);
      if (important || node.degree > 8) { const glow = ctx.createRadialGradient(p.x, p.y, radius, p.x, p.y, radius * 3.5); glow.addColorStop(0, `${color}22`); glow.addColorStop(1, `${color}00`); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, radius * 3.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = `${color}18`; ctx.strokeStyle = `${color}55`; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(p.x, p.y, radius + 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, radius * .55, 0, Math.PI * 2); ctx.fill();
      if (node.id === this.selected || pathIds.has(node.id)) { ctx.strokeStyle = '#b7e9f3'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, radius + 6, 0, Math.PI * 2); ctx.stroke(); }
    }
    const boxes = collisionGrid();
    const labels = focus ? [...this.visible.nodes].sort((a, b) => (b.id === focus) - (a.id === focus) || b.degree - a.degree) : this.visible.nodes;
    let labelCount = 0;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    for (const node of labels) {
      if (labelCount >= 100 || (scale < .4 && node.degree < 5 && node.id !== focus)) continue;
      if (focus && node.id !== focus && !neighbors.has(node.id) && !pathIds.has(node.id)) continue;
      const p = point(node), text = node.title.length > 30 ? `${node.title.slice(0, 28)}…` : node.title;
      const textWidth = ctx.measureText(text).width, labelY = p.y + node.radius * Math.min(1.2, Math.max(.6, scale)) + 20;
      const box = { x: p.x - textWidth / 2 - 5, y: labelY - 12, width: textWidth + 10, height: 20 };
      if (box.x < 2 || box.x + box.width > width - 2 || box.y < 82 || box.y + box.height > height - 100 || !boxes.add(box)) continue;
      ctx.globalAlpha = node.id === focus ? 1 : .83; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#0b1118'; ctx.strokeText(text, p.x, labelY);
      ctx.fillStyle = node.id === focus ? '#d8f1f7' : '#9aafc4'; ctx.fillText(text, p.x, labelY); labelCount++;
    }
    ctx.globalAlpha = 1;
  }
  destroy() { cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); }
}
