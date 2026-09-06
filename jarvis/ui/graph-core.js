// Pure graph math. No DOM, network, dependencies or access to source files.
export const TYPE_COLORS = Object.freeze({
  product: '#8ad8e7', project: '#80a9db', decision: '#bea4df', experiment: '#82b9b0',
  metric: '#cab17d', note: '#92a2ba', research: '#b69aae', task: '#879fca',
  client: '#82c9b3', person: '#b8a0d3', invoice: '#c6b887', meeting: '#819fbb',
});
export const colorForType = type => TYPE_COLORS[type] || '#9aafc3';

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

export function makeNodes(input) {
  return [...input].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id)).map((node, i) => {
    const angle = i * 2.399963229728653 + hash(node.id) / 4294967296 * .25;
    const distance = 34 * Math.sqrt(i + 1);
    return { ...node, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance,
      vx: 0, vy: 0, radius: 3.6 + Math.min(12, Math.sqrt(node.degree) * 1.5), pinned: false };
  });
}

export function visibleGraph(nodes, edges, types) {
  const visible = nodes.filter(node => types.has(node.type));
  const byId = new Map(visible.map(node => [node.id, node]));
  const links = edges.filter(edge => byId.has(edge.source) && byId.has(edge.target));
  const adjacency = new Map(visible.map(node => [node.id, new Set()]));
  for (const edge of links) {
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  }
  return { nodes: visible, edges: links, byId, adjacency };
}

export function shortestPath(adjacency, start, end) {
  if (!adjacency.has(start) || !adjacency.has(end)) return null;
  const previous = new Map([[start, null]]), queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (id === end) {
      const path = [];
      for (let cursor = end; cursor !== null; cursor = previous.get(cursor)) path.push(cursor);
      return path.reverse();
    }
    for (const neighbor of adjacency.get(id)) if (!previous.has(neighbor)) {
      previous.set(neighbor, id); queue.push(neighbor);
    }
  }
  return null;
}

export function physicsStep(nodes, edges, alpha = 1) {
  const cutoff = 150, grid = new Map(), byId = new Map(nodes.map(node => [node.id, node]));
  const key = (x, y) => `${x},${y}`;
  for (const node of nodes) {
    const cell = key(Math.floor(node.x / cutoff), Math.floor(node.y / cutoff));
    if (!grid.has(cell)) grid.set(cell, []);
    grid.get(cell).push(node);
  }
  // A crowded cell must not turn repulsion back into unbounded n² work.
  for (const node of nodes) {
    const cx = Math.floor(node.x / cutoff), cy = Math.floor(node.y / cutoff);
    let visits = 0;
    outer: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const other of grid.get(key(cx + dx, cy + dy)) || []) {
        if (other === node) continue;
        if (++visits > 160) break outer;
        let rx = node.x - other.x, ry = node.y - other.y;
        if (rx === 0 && ry === 0) { rx = node.id < other.id ? -.1 : .1; ry = .1; }
        const squared = rx * rx + ry * ry;
        if (squared > cutoff * cutoff) continue;
        const force = 22 * alpha / (squared + 80);
        node.vx += rx * force; node.vy += ry * force;
      }
    }
  }
  for (const edge of edges) {
    const a = byId.get(edge.source), b = byId.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1;
    const target = 68 + a.radius + b.radius;
    const force = (distance - target) / distance * .009 * alpha;
    a.vx += dx * force; a.vy += dy * force;
    b.vx -= dx * force; b.vy -= dy * force;
  }
  for (const node of nodes) {
    if (node.pinned) { node.vx = node.vy = 0; continue; }
    node.vx = (node.vx - node.x * .0012 * alpha) * .82;
    node.vy = (node.vy - node.y * .0012 * alpha) * .82;
    node.x += Math.max(-5, Math.min(5, node.vx));
    node.y += Math.max(-5, Math.min(5, node.vy));
  }
}

export function fitTransform(nodes, width, height) {
  if (!nodes.length) return { x: width / 2, y: height / 2, scale: 1 };
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const n of nodes) { left = Math.min(left, n.x); right = Math.max(right, n.x); top = Math.min(top, n.y); bottom = Math.max(bottom, n.y); }
  const scale = Math.max(.1, Math.min(1.6, (width - 125) / Math.max(100, right - left), (height - 220) / Math.max(100, bottom - top)));
  return { x: width / 2 - (left + right) / 2 * scale,
    y: (height + 8) / 2 - (top + bottom) / 2 * scale, scale };
}

export function zoomAt(view, factor, x, y) {
  const scale = Math.max(.12, Math.min(4, view.scale * factor));
  const worldX = (x - view.x) / view.scale, worldY = (y - view.y) / view.scale;
  return { scale, x: x - worldX * scale, y: y - worldY * scale };
}

export function collisionGrid(cellSize = 64) {
  const cells = new Map();
  const keys = box => {
    const result = [];
    for (let x = Math.floor(box.x / cellSize); x <= Math.floor((box.x + box.width) / cellSize); x++)
      for (let y = Math.floor(box.y / cellSize); y <= Math.floor((box.y + box.height) / cellSize); y++) result.push(`${x},${y}`);
    return result;
  };
  return { add(box) {
    const relevant = keys(box);
    for (const key of relevant) for (const other of cells.get(key) || []) {
      if (box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y) return false;
    }
    for (const key of relevant) { if (!cells.has(key)) cells.set(key, []); cells.get(key).push(box); }
    return true;
  } };
}
