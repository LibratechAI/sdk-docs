// Browser-side overlay shared by both video modes: an animated cursor, a caption
// pill and a spotlight. Web Animations API → smooth and deterministic. Coordinates
// are normalised (0..1) to the viewport. Top frame only — the SDK iframe gets none.
export const OVERLAY_CSS = `
#__ov_cursor{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483646;pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));transform:translate(-100px,-100px)}
#__ov_caption{position:fixed;left:50%;bottom:6%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;max-width:80%;padding:10px 18px;border-radius:12px;background:rgba(20,20,20,.86);color:#fff;font:500 18px/1.35 -apple-system,Segoe UI,Roboto,sans-serif;text-align:center;opacity:0;transition:opacity .35s ease}
#__ov_spot{position:fixed;left:0;top:0;z-index:2147483645;pointer-events:none;border-radius:14px;box-shadow:0 0 0 3px rgba(255,59,92,.9);opacity:0;transition:opacity .3s ease,left .45s,top .45s,width .45s,height .45s}
`;

export const OVERLAY_JS = `
(() => {
  if (window.top !== window || window.__ov) return;
  const EASE = 'cubic-bezier(.22,.61,.36,1)';
  const cur = document.createElement('div'); cur.id = '__ov_cursor';
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 3l14 8-6 1.5L9 19z" fill="#fff" stroke="#1a1a1a" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const cap = document.createElement('div'); cap.id = '__ov_caption';
  const spot = document.createElement('div'); spot.id = '__ov_spot';
  const mount = () => document.body.append(spot, cur, cap);
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  const vw = () => window.innerWidth, vh = () => window.innerHeight;
  let lastX = -100, lastY = -100;
  window.__ov = {
    async cursorTo(nx, ny, ms = 650) {
      const x = nx * vw(), y = ny * vh();
      const a = cur.animate([{ transform: \`translate(\${lastX}px,\${lastY}px)\` }, { transform: \`translate(\${x}px,\${y}px)\` }], { duration: ms, easing: EASE, fill: 'forwards' });
      lastX = x; lastY = y;
      await a.finished.catch(() => {});
    },
    async clickPulse() { await cur.animate([{ transform: cur.style.transform }], { duration: 90 }).finished.catch(() => {}); },
    caption(text, ms = 350) { if (!text) { cap.style.opacity = '0'; return; } cap.textContent = text; cap.style.transition = \`opacity \${ms}ms ease\`; cap.style.opacity = '1'; },
    hideCaption() { cap.style.opacity = '0'; },
    spotlight(rect) {
      if (!rect) { spot.style.opacity = '0'; return; }
      const [x, y, w, h] = rect, pad = 8;
      spot.style.left = (x * vw() - pad) + 'px'; spot.style.top = (y * vh() - pad) + 'px';
      spot.style.width = (w * vw() + pad * 2) + 'px'; spot.style.height = (h * vh() + pad * 2) + 'px';
      spot.style.opacity = '1';
    },
  };
})();
`;
