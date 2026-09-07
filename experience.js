/* Perspective-projected particle orbits, pointer parallax, and motion controls.
   No external animation runtime or render-blocking dependencies. */
(() => {
  'use strict';
  const stage = document.getElementById('core-stage');
  if (!stage) return;
  const art = stage.querySelector('.core-art');
  const toggle = document.getElementById('motion-toggle');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let paused = preference.matches;
  try { paused = paused || localStorage.getItem('tokyra-motion') === 'off'; } catch { /* Storage is optional. */ }
  let inView = true;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let width = 1;
  let height = 1;
  let targetX = 0;
  let targetY = 0;
  let x = 0;
  let y = 0;
  let scroll = 0;
  const canvas = document.createElement('canvas');
  canvas.className = 'core-orbits';
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);
  const context = canvas.getContext('2d');
  const particles = Array.from({ length: 130 }, (_, i) => ({
    angle: i * 2.399963,
    radius: .29 + ((i * 37) % 97) / 480,
    tilt: (i % 3 - 1) * .65,
    speed: .035 + (i % 7) * .009,
    size: i % 17 === 0 ? 2.4 : .65 + i % 3 * .35,
  }));
  function project(px, py, pz, rx, ry) {
    const yy = py * Math.cos(rx) - pz * Math.sin(rx);
    const zz = py * Math.sin(rx) + pz * Math.cos(rx);
    const xx = px * Math.cos(ry) + zz * Math.sin(ry);
    const z = -px * Math.sin(ry) + zz * Math.cos(ry);
    const scale = 2.5 / (2.5 - z);
    return { x: width / 2 + xx * width * scale, y: height / 2 + yy * width * scale, z, scale };
  }
  function draw() {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const rx = -.4 + y * .18;
    const ry = -.15 + x * .23;
    for (let ring = 0; ring < 3; ring++) {
      context.beginPath();
      for (let n = 0; n <= 160; n++) {
        const a = n / 160 * Math.PI * 2;
        const r = .39 + ring * .046;
        const p = project(Math.cos(a) * r, Math.sin(a) * r * .62, Math.sin(a) * r * Math.sin(ring * .64 + elapsed * .035), rx, ry);
        if (n === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
      }
      context.strokeStyle = `rgba(167, 117, 242, ${.09 + ring * .025})`;
      context.lineWidth = .65;
      context.stroke();
    }
    const points = particles.map(particle => {
      const a = particle.angle + elapsed * particle.speed;
      const r = particle.radius;
      const point = project(Math.cos(a) * r, Math.sin(a) * r * Math.cos(particle.tilt), Math.sin(a) * r * Math.sin(particle.tilt), rx, ry);
      return { ...point, size: particle.size };
    }).sort((a, b) => a.z - b.z);
    for (const p of points) {
      const opacity = Math.max(.1, .5 + p.z * .8);
      context.fillStyle = `rgba(198, 157, 255, ${opacity})`;
      context.beginPath();
      context.arc(p.x, p.y, p.size * p.scale, 0, Math.PI * 2);
      context.fill();
      if (p.size > 2) {
        context.strokeStyle = `rgba(225, 207, 255, ${opacity * .75})`;
        context.beginPath();context.moveTo(p.x - 5, p.y);context.lineTo(p.x + 5, p.y);
        context.moveTo(p.x, p.y - 5);context.lineTo(p.x, p.y + 5);context.stroke();
      }
    }
  }
  function animate(now) {
    frame = 0;
    if (paused || !inView || document.hidden) return;
    const dt = Math.min((now - (lastTime || now)) / 1000, .04);
    lastTime = now;
    elapsed += dt;
    const ease = 1 - Math.exp(-dt * 4.5);
    x += (targetX - x) * ease;
    y += (targetY - y) * ease;
    const float = Math.sin(elapsed * .65) * 10;
    art.style.transform = `translate3d(${x * 9}px,${float + scroll * -14}px,0) rotateX(${-y * 10}deg) rotateY(${x * 13}deg) rotateZ(${Math.sin(elapsed * .18) * 4}deg)`;
    draw();
    frame = requestAnimationFrame(animate);
  }
  function start() {
    if (!frame && !paused && inView && !document.hidden) {
      lastTime = 0;
      frame = requestAnimationFrame(animate);
    }
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  function syncMotion() {
    root.dataset.motion = paused ? 'off' : 'on';
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.innerHTML = `<span aria-hidden="true">${paused ? '▷' : 'Ⅱ'}</span> ${paused ? 'Resume motion' : 'Pause motion'}`;
    if (paused) { stop(); art.style.transform = ''; draw(); } else start();
  }
  function resize() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  toggle.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('tokyra-motion', paused ? 'off' : 'on'); } catch { /* Optional. */ }
    syncMotion();
  });
  preference.addEventListener('change', event => { paused = event.matches; syncMotion(); });
  stage.addEventListener('pointermove', event => {
    if (paused || event.pointerType === 'touch') return;
    const bounds = stage.getBoundingClientRect();
    targetX = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    targetY = (event.clientY - bounds.top) / bounds.height * 2 - 1;
  }, { passive: true });
  stage.addEventListener('pointerleave', () => { targetX = targetY = 0; });
  window.addEventListener('scroll', () => { scroll = Math.min(1, window.scrollY / window.innerHeight); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView) start(); else stop();
  }, { rootMargin: '100px' }).observe(stage);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  resize();
  syncMotion();
})();
