import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeNodes, visibleGraph, shortestPath, physicsStep, zoomAt, collisionGrid, fitTransform } from '../ui/graph-core.js';
import { VoiceController, SILENCE_MS } from '../ui/voice-client.js';

const fixtures = [{ id: 'a', degree: 2, type: 'note' }, { id: 'b', degree: 2, type: 'task' }, { id: 'c', degree: 1, type: 'note' }];
const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
test('seeded layout does not depend on input order', () => { assert.deepEqual(makeNodes(fixtures), makeNodes([...fixtures].reverse())); });
test('paths respect filters and preserve full degree', () => {
  const all = visibleGraph(makeNodes(fixtures), edges, new Set(['note', 'task']));
  assert.deepEqual(shortestPath(all.adjacency, 'a', 'c'), ['a', 'b', 'c']);
  const filtered = visibleGraph(all.nodes, edges, new Set(['note']));
  assert.equal(shortestPath(filtered.adjacency, 'a', 'c'), null); assert.equal(filtered.nodes[0].degree, 2);
});
test('zoom is anchored at the cursor', () => {
  const original = { x: 10, y: 20, scale: .8 }, target = { x: 250, y: 170 };
  const zoom = zoomAt(original, 1.5, target.x, target.y);
  assert.ok(Math.abs((target.x - original.x) / original.scale - (target.x - zoom.x) / zoom.scale) < 1e-9);
});
test('labels reject overlap including adjacent grid cells', () => {
  const boxes = collisionGrid(); assert.equal(boxes.add({ x: 60, y: 60, width: 25, height: 20 }), true);
  assert.equal(boxes.add({ x: 80, y: 75, width: 20, height: 20 }), false);
  assert.equal(boxes.add({ x: 200, y: 200, width: 25, height: 20 }), true);
});
test('crowded 1500-node simulation remains finite and bounded', () => {
  const nodes = makeNodes(Array.from({ length: 1500 }, (_, i) => ({ id: `${i}`, type: 'note', degree: 1 })));
  nodes.forEach(node => { node.x = node.y = 0; });
  const start = performance.now(); physicsStep(nodes, [], 1);
  assert.ok(nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.ok(performance.now() - start < 2000); assert.ok(Number.isFinite(fitTransform(nodes, 500, 500).scale));
});
function controller() { return new VoiceController({ state() {}, level() {}, caption() {}, error() {} }); }
test('speaking/thinking pauses disable microphone tracks', () => {
  const voice = controller(), track = { enabled: true }; voice.stream = { getAudioTracks: () => [track] };
  voice.pause(); assert.equal(track.enabled, false); assert.equal(voice.state, 'thinking');
});
test('900ms silence ends a detected speech turn', () => {
  const voice = controller(); voice.active = true; voice.state = 'listening'; voice.samples = new Float32Array(16);
  voice.analyser = { getFloatTimeDomainData(samples) { samples.fill(0); } };
  voice.hasSpeech = true; voice.lastLoud = performance.now() - SILENCE_MS - 10; voice.started = performance.now() - 2000;
  let ended = false; voice.finishTurn = () => { ended = true; }; voice.tick(); assert.equal(ended, true);
});
test('silence without speech never invokes transcription', () => {
  const voice = controller(); voice.active = true; voice.state = 'listening'; voice.samples = new Float32Array(16);
  voice.analyser = { getFloatTimeDomainData(samples) { samples.fill(0); } }; voice.hasSpeech = false;
  voice.started = performance.now(); let ended = false; voice.finishTurn = () => { ended = true; };
  voice.tick(); assert.equal(ended, false);
});
