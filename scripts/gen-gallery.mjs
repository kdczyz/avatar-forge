/**
 * 生成纯粹的 Bot / Agent 角色图库（gallery/*.json）。
 * 清理旧版杂项图形，聚焦 GrokBot / AI Agent 风格形象。
 * 全部由参数化图元生成，并由 tests/gallery.test.ts 逐条校验。
 *
 *   node scripts/gen-gallery.mjs
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const r2 = (n) => Math.round(n * 100) / 100;
const P = ([x, y]) => `${r2(x)} ${r2(y)}`;
const TAU = Math.PI * 2;

function circle(cx, cy, r, ccw = false) {
  const sweep = ccw ? 0 : 1;
  return `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 ${sweep} ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 ${sweep} ${r2(cx - r)} ${r2(cy)}Z`;
}

function ellipse(cx, cy, rx, ry, ccw = false) {
  const sweep = ccw ? 0 : 1;
  return `M${r2(cx - rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 ${sweep} ${r2(cx + rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 ${sweep} ${r2(cx - rx)} ${r2(cy)}Z`;
}

function rrect(x, y, w, h, r) {
  const x0 = r2(x);
  const y0 = r2(y);
  const x1 = r2(x + w);
  const y1 = r2(y + h);
  const rr = r2(Math.min(r, Math.min(w, h) / 2));
  return (
    `M${r2(x + rr)} ${y0}H${r2(x + w - rr)}A${rr} ${rr} 0 0 1 ${x1} ${r2(y + rr)}` +
    `V${r2(y + h - rr)}A${rr} ${rr} 0 0 1 ${r2(x + w - rr)} ${y1}` +
    `H${r2(x + rr)}A${rr} ${rr} 0 0 1 ${x0} ${r2(y + h - rr)}` +
    `V${r2(y + rr)}A${rr} ${rr} 0 0 1 ${r2(x + rr)} ${y0}Z`
  );
}

function poly(points) {
  return `M${points.map(P).join('L')}Z`;
}

function blob(pts, tension = 1) {
  const n = pts.length;
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return `${d}Z`;
}

function ring(cx, cy, rx, ry, thickness, tilt = 0, steps = 56) {
  const outer = [];
  const inner = [];
  const ix = Math.max(0.5, rx - thickness);
  const iy = Math.max(0.5, ry - thickness);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const rot = (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * TAU - Math.PI / 2;
    outer.push(rot(Math.cos(a) * rx, Math.sin(a) * ry));
    inner.push(rot(Math.cos(a) * ix, Math.sin(a) * iy));
  }
  return poly(outer) + poly(inner.reverse());
}

const avatars = [];
const add = (id, name, path, eyes) => avatars.push({ version: 1, id, name, body: { path }, eyes });

// ---------------------------------------------------------------------------
// Grok / Agent 风格 Bot 家族

// Grok Pod：浑圆穹顶头舱 + 稳重悬浮底座
add(
  'grok-pod',
  'Grok Pod',
  ellipse(50, 46, 36, 33) + rrect(26, 70, 48, 16, 8),
  { x: 50, y: 45, spacing: 18, scale: 1.15 },
);

// Relay：圆润机头 + 顶部粗天线信号球
add(
  'relay',
  'Relay',
  rrect(16, 30, 68, 56, 24) + rrect(45, 16, 10, 18, 4) + circle(50, 15, 7),
  { x: 50, y: 56, spacing: 18, scale: 1.12 },
);

// Mecha：圆角头部 + 两侧厚实耳机耳罩
add(
  'mecha',
  'Mecha',
  rrect(20, 20, 60, 62, 22) + rrect(10, 36, 14, 30, 7) + rrect(76, 36, 14, 30, 7),
  { x: 50, y: 49, spacing: 17, scale: 1.1 },
);

// Droid：头罩 + 颈柱 + 紧凑身躯
add(
  'droid',
  'Droid',
  rrect(19, 14, 62, 42, 18) + rrect(41, 52, 18, 10, 4) + rrect(28, 59, 44, 29, 12),
  { x: 50, y: 34, spacing: 17, scale: 1.08 },
);

// Neko：软萌猫耳伙伴 Bot
add(
  'neko',
  'Neko',
  ellipse(50, 54, 34, 31) +
    blob(
      [
        [20, 42],
        [21, 14],
        [42, 29],
      ],
      0.85,
    ) +
    blob(
      [
        [80, 42],
        [79, 14],
        [58, 29],
      ],
      0.85,
    ),
  { x: 50, y: 52, spacing: 17, scale: 1.1 },
);

// Spark：四瓣圆润 AI 星火核心
add(
  'spark',
  'Spark',
  blob(
    [
      [50, 10],
      [62, 34],
      [90, 50],
      [62, 66],
      [50, 90],
      [38, 66],
      [10, 50],
      [38, 34],
    ],
    0.9,
  ),
  { x: 50, y: 50, spacing: 15, scale: 1.05 },
);

// Guardian：圆润护盾 Agent
add(
  'guardian',
  'Guardian',
  blob(
    [
      [50, 11],
      [81, 20],
      [84, 51],
      [71, 76],
      [50, 89],
      [29, 76],
      [16, 51],
      [19, 20],
    ],
    0.95,
  ),
  { x: 50, y: 46, spacing: 17, scale: 1.12 },
);

// Phantom：幽灵形态轻量 Bot
add(
  'ghost',
  'Phantom',
  `M24 50C24 27 35 12 50 12C65 12 76 27 76 50L77 78C77 84 72 87 67 87C62 87 60 83 58 80C56 84 53 87 50 87` +
    `C47 87 44 84 42 80C40 83 38 87 33 87C28 87 23 84 23 78Z`,
  { x: 50, y: 43, spacing: 16, scale: 1.15 },
);

// Orbiter：星环绕行 Bot
add(
  'orbiter',
  'Orbiter',
  circle(50, 49, 27) + ring(50, 54, 41, 12, 6.5, -0.26),
  { x: 50, y: 46, spacing: 15, scale: 1.05 },
);

// Mochi：上窄下宽的超 Q 弹麻薯 Bot
add(
  'mochi',
  'Mochi',
  blob(
    [
      [50, 14],
      [71, 20],
      [85, 44],
      [87, 68],
      [71, 86],
      [50, 88],
      [29, 86],
      [13, 68],
      [15, 44],
      [29, 20],
    ],
    0.95,
  ),
  { x: 50, y: 50, spacing: 17, scale: 1.15 },
);

mkdirSync('gallery', { recursive: true });
for (const file of readdirSync('gallery')) {
  if (file.endsWith('.json')) unlinkSync(join('gallery', file));
}
for (const def of avatars) {
  writeFileSync(join('gallery', `${def.id}.json`), `${JSON.stringify(def, null, 2)}\n`);
}
console.log(`wrote ${avatars.length} bot gallery definitions: ${avatars.map((a) => a.id).join(', ')}`);
