/**
 * 生成 gallery/*.json —— 全部自研：所有轮廓都由这里的图元（圆、椭圆、圆角矩形、
 * 多边形、星形、Catmull-Rom 平滑 blob、以及它们的布尔式组合）现场拼出来，
 * 没有任何外部素材。合法性由 tests/gallery.test.ts 用运行时校验器逐条验证。
 *
 *   node scripts/gen-gallery.mjs
 *
 * 约定：外轮廓顺时针（SVG y 向下），挖孔逆时针（nonzero 填充规则）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const r2 = (n) => Math.round(n * 100) / 100;
const P = ([x, y]) => `${r2(x)} ${r2(y)}`;
const TAU = Math.PI * 2;

/** 顺时针圆；`ccw` 时反转，用作挖孔。 */
function circle(cx, cy, r, ccw = false) {
  const sweep = ccw ? 0 : 1;
  return `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 ${sweep} ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 ${sweep} ${r2(cx - r)} ${r2(cy)}Z`;
}

/** 顺时针椭圆；`ccw` 时反转。 */
function ellipse(cx, cy, rx, ry, ccw = false) {
  const sweep = ccw ? 0 : 1;
  return `M${r2(cx - rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 ${sweep} ${r2(cx + rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 ${sweep} ${r2(cx - rx)} ${r2(cy)}Z`;
}

/** 圆角矩形（顺时针）。 */
function rrect(x, y, w, h, r) {
  const x0 = r2(x);
  const y0 = r2(y);
  const x1 = r2(x + w);
  const y1 = r2(y + h);
  const rr = r2(Math.min(r, Math.min(w, h) / 2));
  return (
    `M${r2(x + r)} ${y0}H${r2(x + w - r)}A${rr} ${rr} 0 0 1 ${x1} ${r2(y + r)}` +
    `V${r2(y + h - r)}A${rr} ${rr} 0 0 1 ${r2(x + w - r)} ${y1}` +
    `H${r2(x + r)}A${rr} ${rr} 0 0 1 ${x0} ${r2(y + h - r)}` +
    `V${r2(y + r)}A${rr} ${rr} 0 0 1 ${r2(x + r)} ${y0}Z`
  );
}

function poly(points) {
  return `M${points.map(P).join('L')}Z`;
}

/** 星形（顺时针）。 */
function star(cx, cy, outer, inner, points = 5, rotate = -Math.PI / 2) {
  const pts = [];
  for (let k = 0; k < points * 2; k++) {
    const rad = k % 2 ? inner : outer;
    const a = rotate + (k * Math.PI) / points;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return poly(pts);
}

/** Catmull-Rom 平滑闭合曲线：给一圈点时用它得到有机的“软”轮廓（弹性球体、云、史莱姆都靠它）。 */
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

/** 按角度均匀取点的椭圆环（含内半径），用于星球环、甜甜圈这类“环带”。 */
function ring(cx, cy, rx, ry, thickness, steps = 48) {
  const outer = [];
  const inner = [];
  const ix = Math.max(0.5, rx - thickness);
  const iy = Math.max(0.5, ry - thickness);
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * TAU - Math.PI / 2;
    outer.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    inner.push([cx + Math.cos(a) * ix, cy + Math.sin(a) * iy]);
  }
  return poly(outer) + poly(inner.reverse());
}

/** 一簇圆合并成云：多个顺时针圆叠在一起，nonzero 下自动并成一块。 */
function cloudLobes(cx, cy, scale = 1) {
  const s = scale;
  return (
    circle(cx - 20 * s, cy + 6 * s, 14 * s) +
    circle(cx - 4 * s, cy - 2 * s, 19 * s) +
    circle(cx + 16 * s, cy + 2 * s, 15 * s) +
    circle(cx + 27 * s, cy + 12 * s, 9 * s) +
    rrect(cx - 34 * s, cy + 6 * s, 70 * s, 20 * s, 10 * s)
  );
}

const avatars = [];
const add = (id, name, path, eyes) => avatars.push({ version: 1, id, name, body: { path }, eyes });

// ---------------------------------------------------------------------------
// 弹性 / 软体

// 弹性球体：略扁的圆，底边更宽，像一颗能压扁的果冻。
add(
  'blob',
  'Blob',
  blob([
    [50, 11],
    [71, 17],
    [84, 35],
    [83, 62],
    [70, 83],
    [50, 89],
    [30, 83],
    [17, 62],
    [16, 35],
    [29, 17],
  ]),
  { x: 50, y: 45, spacing: 17, scale: 1.25 },
);

// 纯球：最“标准”的弹性球，靠运行时压扁/拉伸体现手感。
add('orb', 'Orb', circle(50, 50, 38), { x: 50, y: 46, spacing: 17, scale: 1.3 });

// 云朵：四个圆 + 一条平底。
add('cloud', 'Cloud', cloudLobes(50, 52), { x: 50, y: 50, spacing: 17, scale: 1.2 });

// 云朵的“蓬松”变体：更多瓣、更高。
add(
  'cumulus',
  'Cumulus',
  circle(36, 56, 17) + circle(52, 40, 22) + circle(68, 54, 17) + circle(30, 68, 12) + circle(70, 70, 13) + rrect(24, 58, 52, 20, 10),
  { x: 50, y: 50, spacing: 16, scale: 1.2 },
);

// 苹果圆角方（squircle）：超椭圆的近似。
add(
  'squircle',
  'Squircle',
  blob([
    [50, 9],
    [79, 12],
    [88, 24],
    [91, 50],
    [88, 78],
    [76, 88],
    [50, 91],
    [24, 88],
    [12, 76],
    [9, 50],
    [12, 24],
    [21, 12],
  ]),
  { x: 50, y: 46, spacing: 17, scale: 1.25 },
);

// 胶囊：竖着的软胶囊。
add('capsule', 'Capsule', rrect(24, 8, 52, 84, 26), { x: 50, y: 44, spacing: 16, scale: 1.25 });

// 豆子：一边凹进去的肾形。
add(
  'bean',
  'Bean',
  blob([
    [52, 12],
    [74, 20],
    [85, 42],
    [80, 68],
    [62, 86],
    [40, 90],
    [22, 76],
    [17, 52],
    [26, 26],
    [40, 16],
  ]),
  { x: 52, y: 50, spacing: 17, scale: 1.2 },
);

// 麻薯：软塌塌的圆角三角。
add(
  'mochi',
  'Mochi',
  blob([
    [50, 15],
    [72, 30],
    [86, 62],
    [82, 80],
    [50, 88],
    [18, 80],
    [14, 62],
    [28, 30],
  ]),
  { x: 50, y: 55, spacing: 17, scale: 1.25 },
);

// 史莱姆：上圆下流的滴。
add(
  'slime',
  'Slime',
  blob([
    [50, 10],
    [72, 18],
    [84, 40],
    [82, 62],
    [86, 80],
    [70, 88],
    [50, 90],
    [30, 88],
    [14, 80],
    [18, 62],
    [16, 40],
    [28, 18],
  ]),
  { x: 50, y: 44, spacing: 17, scale: 1.25 },
);

// 河豚：圆身 + 一圈小鼓包。
add(
  'puffer',
  'Puffer',
  (() => {
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const rad = k % 2 ? 34 : 37.5;
      pts.push([50 + Math.cos(a) * rad, 52 + Math.sin(a) * rad * 0.95]);
    }
    return blob(pts, 0.9);
  })(),
  { x: 50, y: 50, spacing: 16, scale: 1.2 },
);

// ---------------------------------------------------------------------------
// 天体 / 环

// 星球 + 环。
add(
  'planet',
  'Planet',
  circle(50, 42, 27) + ring(50, 50, 44, 13, 5),
  { x: 50, y: 40, spacing: 15, scale: 1.2 },
);

// 月亮：大圆减去一个偏移圆（孔洞反向）。
add('moon', 'Moon', circle(52, 50, 36) + circle(66, 38, 25, true), { x: 32, y: 58, spacing: 11, scale: 0.95 });

// 甜甜圈：环带。
add('donut', 'Donut', circle(50, 52, 40) + circle(50, 52, 9, true), { x: 50, y: 30, spacing: 18, scale: 1.2 });

// 骰子：圆角方块 + 六个点（挖孔）。
add(
  'dice',
  'Dice',
  rrect(13, 13, 74, 74, 16) +
    circle(31, 31, 4.6, true) +
    circle(69, 69, 4.6, true) +
    circle(31, 69, 4.6, true) +
    circle(69, 31, 4.6, true),
  { x: 50, y: 50, spacing: 16, scale: 1.15 },
);

// ---------------------------------------------------------------------------
// 食物 / 植物

// 蘑菇：伞盖 + 短柄。
add(
  'mushroom',
  'Mushroom',
  blob([
    [50, 22],
    [68, 26],
    [82, 40],
    [80, 52],
    [50, 56],
    [20, 52],
    [18, 40],
    [32, 26],
  ]) + rrect(36, 52, 28, 38, 10),
  { x: 50, y: 40, spacing: 17, scale: 1.15 },
);

// 仙人掌：主干 + 两条侧臂（顺时针圆角矩形）。
add(
  'cactus',
  'Cactus',
  rrect(35, 14, 30, 74, 15) + rrect(16, 40, 22, 14, 7) + rrect(16, 40, 12, 30, 6) + rrect(62, 32, 22, 14, 7) + rrect(72, 32, 12, 24, 6),
  { x: 50, y: 42, spacing: 15, scale: 1.15 },
);

// 珍珠奶茶：杯 + 吸管 + 三颗珍珠（挖孔）。
add(
  'boba',
  'Boba',
  `M32 26H68L64 84C63.5 87 61 89 58 89H42C39 89 36.5 87 36 84Z` +
    `M56 6H62L58 28H54Z` +
    rrect(28, 22, 44, 8, 4) +
    circle(43, 74, 4, true) +
    circle(54, 79, 4, true) +
    circle(58, 68, 3.4, true),
  { x: 50, y: 46, spacing: 15, scale: 1.1 },
);

// 气球：球 + 结。
add(
  'balloon',
  'Balloon',
  blob([
    [50, 8],
    [70, 14],
    [80, 34],
    [74, 56],
    [58, 70],
    [42, 70],
    [26, 56],
    [20, 34],
    [30, 14],
  ]) + poly([
    [46, 70],
    [54, 70],
    [50, 80],
  ]),
  { x: 50, y: 38, spacing: 16, scale: 1.2 },
);

// 嫩芽：种子身体 + 两片叶。
add(
  'sprout',
  'Sprout',
  blob([
    [50, 40],
    [64, 48],
    [68, 68],
    [60, 86],
    [40, 86],
    [32, 68],
    [36, 48],
  ]) +
    blob([
      [46, 42],
      [32, 34],
      [18, 22],
      [28, 16],
      [44, 22],
      [50, 34],
    ]) +
    blob([
      [54, 40],
      [68, 30],
      [82, 20],
      [86, 30],
      [74, 40],
      [58, 44],
    ]),
  { x: 50, y: 66, spacing: 15, scale: 1.1 },
);

// 水母：伞 + 三条触须。
add(
  'jellyfish',
  'Jellyfish',
  blob([
    [50, 12],
    [70, 18],
    [80, 38],
    [78, 52],
    [50, 56],
    [22, 52],
    [20, 38],
    [30, 18],
  ]) +
    `M26 52C24 64 28 72 24 84C22 88 28 88 30 84C34 74 30 64 32 52Z` +
    `M44 54C42 66 46 74 42 86C40 90 46 90 48 86C52 76 48 66 50 54Z` +
    `M62 53C60 65 64 73 60 85C58 89 64 89 66 85C70 75 66 65 68 53Z`,
  { x: 50, y: 36, spacing: 16, scale: 1.15 },
);

// 冰淇淋：蛋筒 + 一球。
add(
  'icecream',
  'Ice Cream',
  poly([
    [30, 46],
    [70, 46],
    [54, 90],
    [46, 90],
  ]) +
    circle(50, 34, 22) +
    circle(37, 40, 13) +
    circle(63, 40, 13),
  { x: 50, y: 34, spacing: 15, scale: 1.1 },
);

// 吐司：面包片 + 一圈边。
add(
  'toast',
  'Toast',
  blob([
    [26, 24],
    [50, 16],
    [74, 24],
    [82, 40],
    [82, 72],
    [74, 84],
    [26, 84],
    [18, 72],
    [18, 40],
  ]),
  { x: 50, y: 46, spacing: 17, scale: 1.2 },
);

// 饺子：褶边 + 鼓肚。
add(
  'dumpling',
  'Dumpling',
  blob([
    [22, 40],
    [30, 24],
    [42, 30],
    [50, 20],
    [58, 30],
    [70, 24],
    [78, 40],
    [80, 64],
    [72, 84],
    [50, 88],
    [28, 84],
    [20, 64],
  ]),
  { x: 50, y: 58, spacing: 16, scale: 1.2 },
);

// ---------------------------------------------------------------------------
// 物件

// 机器人：方头 + 天线 + 两只脚（重画）。
add(
  'robot',
  'Robot',
  rrect(15, 26, 70, 50, 12) + rrect(47, 12, 6, 14, 3) + circle(50, 12, 4.4) + rrect(26, 76, 16, 12, 5) + rrect(58, 76, 16, 12, 5),
  { x: 50, y: 48, spacing: 18, scale: 1.2 },
);

// 幽灵：圆顶 + 三个波浪下摆（重画）。
add(
  'ghost',
  'Ghost',
  `M24 50C24 27 35 12 50 12C65 12 76 27 76 50L77 78C77 84 72 87 67 87C62 87 60 83 58 80C56 84 53 87 50 87` +
    `C47 87 44 84 42 80C40 83 38 87 33 87C28 87 23 84 23 78Z`,
  { x: 50, y: 43, spacing: 16, scale: 1.15 },
);

// 猫：圆脸 + 双耳 + 下巴（重画）。
add(
  'cat',
  'Cat',
  ellipse(50, 42, 31, 24) +
    poly([
      [22, 30],
      [24, 12],
      [40, 24],
    ]) +
    poly([
      [78, 30],
      [76, 12],
      [60, 24],
    ]) +
    blob([
      [32, 58],
      [50, 62],
      [68, 58],
      [70, 76],
      [50, 88],
      [30, 76],
    ]),
  { x: 50, y: 40, spacing: 17, scale: 1.1 },
);

// 马克杯：杯身 + 把手环（挖孔）。
add(
  'mug',
  'Mug',
  rrect(18, 20, 50, 66, 9) + ring(74, 52, 15, 17, 6),
  { x: 42, y: 52, spacing: 15, scale: 1.2 },
);

// 灯泡：玻璃泡 + 灯颈 + 螺纹底（重画）。
add(
  'bulb',
  'Bulb',
  circle(50, 38, 27) +
    `M36 60H64L59 72H41Z` +
    rrect(39, 71, 22, 9, 4) +
    rrect(42, 82, 16, 7, 3),
  { x: 50, y: 38, spacing: 15, scale: 1.15 },
);

// 手柄（重画）。
add(
  'controller',
  'Controller',
  `M28 24C38 22 44 25 50 25C56 25 62 22 72 24C84 26 90 35 91 48C92 62 91 76 82 80` +
    `C75 83 69 78 66 72C63 67 58 66 50 66C42 66 37 67 34 72C31 78 25 83 18 80` +
    `C9 76 8 62 9 48C10 35 16 26 28 24Z`,
  { x: 50, y: 43, spacing: 16, scale: 1.05 },
);

// 星星（重画）。
add('star', 'Star', star(50, 52, 42, 20), { x: 50, y: 50, spacing: 14, scale: 1 });

// 蛋（重画）。
add('egg', 'Egg', ellipse(50, 52, 30, 40), { x: 50, y: 48, spacing: 15, scale: 1.1 });

// 小电视：屏 + 支脚 + 天线（重画）。
add(
  'tv',
  'TV',
  rrect(9, 30, 82, 50, 11) + rrect(28, 78, 10, 10, 3) + rrect(62, 78, 10, 10, 3) + `M34 30L45 14L49 16L40 30Z` + `M66 30L55 14L51 16L60 30Z`,
  { x: 50, y: 54, spacing: 18, scale: 1.05 },
);

// 火箭：箭身 + 尾翼 + 舷窗（挖孔）。
add(
  'rocket',
  'Rocket',
  `M50 8C62 22 68 42 68 72H32C32 42 38 22 50 8Z` +
    poly([
      [32, 54],
      [20, 70],
      [32, 74],
    ]) +
    poly([
      [68, 54],
      [80, 70],
      [68, 74],
    ]) +
    rrect(44, 74, 12, 8, 3) +
    circle(50, 68, 5.5, true),
  { x: 50, y: 48, spacing: 16, scale: 1 },
);

// ---------------------------------------------------------------------------
// Hermes 系列：信使的母题（羽翼 / 双蛇杖 / 卷轴 / 闪电 / 翼盔）
//
// 设计思路：一个“跑得比谁都快、专门送消息”的 bot。母题全部取自信使的符号系统，
// 但只保留能缩到 20px 还认得出的三样——翅膀、杖、头盔轮廓；不做细节雕刻。
// 每个形象仍是“一个主导体 + 一片羽翼/杖”的构图，脸一定是主导体上最实的那块。

/** 粗线（沿折线两侧偏移成轮廓），给蛇身、飘带这类需要厚度的部件用。 */
function tube(points, width, closed = false) {
  const pts = closed ? [...points, points[0]] : points;
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    left.push([p[0] + nx, p[1] + ny]);
    right.push([p[0] - nx, p[1] - ny]);
  }
  return poly([...left, ...right.reverse()]);
}

/** 一片羽翼：三段弧组成的扇面，根部厚、尖端薄。 */
function wing(rootX, rootY, dir, span = 1) {
  const s = span;
  return blob(
    [
      [rootX, rootY],
      [rootX + dir * 6 * s, rootY + 4 * s],
      [rootX + dir * 14 * s, rootY - 4 * s],
      [rootX + dir * 20 * s, rootY - 18 * s],
      [rootX + dir * 12 * s, rootY - 22 * s],
      [rootX + dir * 5 * s, rootY - 12 * s],
      [rootX + dir * 1 * s, rootY - 6 * s],
    ],
    0.9,
  );
}

// 翼盔信使：圆盔 + 盔沿 + 两侧羽翼。
add(
  'hermes',
  'Hermes',
  circle(50, 46, 29) + rrect(16, 49, 68, 9, 4) + wing(28, 40, -1) + wing(72, 40, 1),
  { x: 50, y: 43, spacing: 16, scale: 1.15 },
);

// 双蛇杖：杖头的圆盘当脸，两侧羽翼，杖身上两条蛇身盘绕。
add(
  'caduceus',
  'Caduceus',
  circle(50, 31, 18) +
    wing(32, 29, -1, 0.9) +
    wing(68, 29, 1, 0.9) +
    rrect(45, 47, 10, 43, 5) +
    tube([
      [38, 44],
      [29, 51],
      [31, 61],
      [40, 65],
      [46, 71],
    ], 4.4) +
    tube([
      [62, 44],
      [71, 51],
      [69, 61],
      [60, 65],
      [54, 71],
    ], 4.4),
  { x: 50, y: 31, spacing: 14, scale: 1.05 },
);

// 单翼：圆身 + 一侧上扬的大羽翼（“带着风跑”的剪影）。
add(
  'wing',
  'Wing',
  circle(44, 56, 26) + wing(62, 54, 1, 1.15),
  { x: 44, y: 54, spacing: 15, scale: 1.1 },
);

// 闪电：圆形电荷头 + 一束闪电（信使的速度）。
add(
  'bolt',
  'Bolt',
  circle(50, 26, 19) +
    poly([
      [58, 40],
      [40, 68],
      [49, 68],
      [43, 90],
      [66, 58],
      [55, 58],
      [62, 40],
    ]),
  { x: 50, y: 26, spacing: 14, scale: 1.0 },
);

// 卷轴：纸面 + 两端卷边 + 下方飘带（“消息本身”）。
add(
  'scroll',
  'Scroll',
  rrect(20, 32, 60, 40, 6) + circle(20, 52, 11) + circle(80, 52, 11) + rrect(36, 70, 28, 10, 5),
  { x: 50, y: 50, spacing: 15, scale: 1.1 },
);

mkdirSync('gallery', { recursive: true });
for (const def of avatars) {
  writeFileSync(join('gallery', `${def.id}.json`), `${JSON.stringify(def, null, 2)}\n`);
}
console.log(`wrote ${avatars.length} gallery definitions: ${avatars.map((a) => a.id).join(', ')}`);