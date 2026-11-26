/** 工作台：基于 GrokBot 引擎（黏土体积躯干 + 48 点眼环弹簧 + 双节奏状态机）。 */
import './style.css';
import { renderSvg } from '../core/svg.ts';
import { validateAvatar } from '../core/validate.ts';
import type { AvatarDefinition, AvatarMood, AvatarState, BadgeKind } from '../core/types.ts';
import { EXPRESSIONS } from '../bot/ring.ts';
import { PALETTES, derivePalette } from '../bot/palettes.ts';
import { SHAPES } from '../bot/shapes.ts';
import { GrokBot, registerGrokBot } from '../bot/grok-bot.ts';
import { GALLERY } from './gallery.ts';
import { DESIGN_PROMPT } from './prompt.ts';

registerGrokBot();

const STATES: { value: AvatarState; label: string; hint: string }[] = [
  { value: 'idle', label: 'Idle', hint: '双节奏待机：自然眨眼与状态机微表情' },
  { value: 'thinking', label: 'Thinking', hint: '思考中：三圆点让位，表情在好奇/怀疑/专注间切换' },
  { value: 'working', label: 'Working', hint: '忙碌：彩带扫过，眼神专注' },
  { value: 'waiting', label: 'Waiting', hint: '等待：侧身叹气，半眯眼' },
  { value: 'blocked', label: 'Blocked', hint: '阻塞：变成跳动的感叹号' },
  { value: 'done', label: 'Done', hint: '完成：粒子绽放 + 喜悦/爱心表情' },
  { value: 'alert', label: 'Alert', hint: '警觉：高频脉动 + 惊讶/专注' },
];

const MOOD_LABELS: Record<AvatarMood, string> = {
  neutral: '中性',
  happy: '开心',
  joy: '欢呼',
  love: '爱心',
  surprised: '惊讶',
  curious: '好奇',
  skeptical: '怀疑',
  wink: '眨眼',
  sleepy: '困倦',
  bored: '无聊',
  sad: '难过',
  angry: '生气',
  focused: '专注',
  confused: '困惑',
  shy: '害羞',
  smug: '得意',
};

const BADGES: { value: BadgeKind; label: string }[] = [
  { value: 'none', label: '无角标' },
  { value: 'blue', label: '蓝点' },
  { value: 'red', label: '红点' },
];

const YOURS_KEY = 'avatar-forge:yours';

function must<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing element ${selector}`);
  return el;
}

function loadYours(): AvatarDefinition[] {
  try {
    const raw = JSON.parse(localStorage.getItem(YOURS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      const res = validateAvatar(item);
      return res.ok ? [res.value] : [];
    });
  } catch {
    return [];
  }
}

function saveYours(list: AvatarDefinition[]): void {
  try {
    localStorage.setItem(YOURS_KEY, JSON.stringify(list));
  } catch {
    /* 忽略配额限制 */
  }
}

// ---------------------------------------------------------------------------
// 状态与初始化

let yours: AvatarDefinition[] = loadYours();
let current: AvatarDefinition = SHAPES[0].definition;
let currentPaletteId = PALETTES[0].id;
let customColor = PALETTES[0].base;
let depth = 6;
const isNarrow = window.innerWidth <= 980;
const initialSize = isNarrow
  ? Math.round(Math.min(240, Math.max(168, window.innerWidth * 0.48)) / 8) * 8
  : Math.round(Math.min(440, Math.max(256, Math.min(window.innerWidth * 0.4, window.innerHeight * 0.56))) / 8) * 8;
let size = initialSize;
let state: AvatarState = 'idle';
let moodMode: AvatarMood | 'auto' = 'auto';
let clay = true;
let orbit = false;
let badge: BadgeKind = 'none';
let follow = true;
let sleepIdle = false;
let reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = must<HTMLElement>('#stage');
const runtimeMoodEl = must<HTMLElement>('#runtime-mood');
const fpsEl = must<HTMLElement>('#fps');
const embedPreviewEl = must<HTMLElement>('#embed-preview');

function resizeStage(): void {
  const pad = window.innerWidth <= 980 ? 20 : 40;
  stage.style.minHeight = `${Math.round(size * 1.12) + pad}px`;
}

resizeStage();

const bot = new GrokBot({
  container: stage,
  definition: current,
  palette: currentPaletteId,
  size,
  depth,
  clay,
  state,
  mood: moodMode,
  orbit,
  badge,
  followPointer: follow,
  sleepWhenIdle: sleepIdle,
  reducedMotion: reduce,
  onFrame: ({ mood, sleeping, visible, fps }) => {
    const modeTag = moodMode === 'auto' ? 'auto' : 'lock';
    runtimeMoodEl.textContent = `${modeTag}: ${MOOD_LABELS[mood] ?? mood}`;
    if (!visible) fpsEl.textContent = 'paused (offscreen)';
    else if (sleeping) fpsEl.textContent = 'sleeping (0 fps)';
    else fpsEl.textContent = `${fps} fps`;
  },
});

bot.wrapper.style.cursor = 'grab';

// ---------------------------------------------------------------------------
// 躯干与图库

const shapesEl = must<HTMLElement>('#shapes');
const galleryEl = must<HTMLElement>('#gallery');
const thumbSvg = new Map<string, string>();

function paletteFor(def: AvatarDefinition) {
  let h = 2166136261;
  for (let i = 0; i < def.id.length; i++) h = Math.imul(h ^ def.id.charCodeAt(i), 16777619);
  return PALETTES[(h >>> 0) % PALETTES.length];
}

function renderThumbList(container: HTMLElement, items: AvatarDefinition[]): void {
  container.replaceChildren();
  for (const def of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = def.id;
    button.title = def.name;
    button.setAttribute('aria-label', def.name);
    const cached = thumbSvg.get(def.id);
    button.innerHTML =
      cached ?? `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${def.body.path}" fill="#c8beb0"/></svg>`;
    button.addEventListener('click', () => select(def));
    container.append(button);
  }
}

function buildGallery(): void {
  renderThumbList(
    shapesEl,
    SHAPES.map((s) => s.definition),
  );
  renderThumbList(galleryEl, [...GALLERY, ...yours]);
  markCurrent();
}

function markCurrent(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('#shapes button, #gallery button')) {
    button.setAttribute('aria-current', button.dataset.id === current.id ? 'true' : 'false');
  }
}

function upgradeThumbnails(): void {
  const all = [...SHAPES.map((s) => s.definition), ...GALLERY, ...yours];
  const queue = all.filter((d) => !thumbSvg.has(d.id));
  const idle: (cb: () => void) => void =
    'requestIdleCallback' in window
      ? (cb) => (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(cb)
      : (cb) => setTimeout(cb, 20);
  const step = () => {
    const def = queue.shift();
    if (!def) return;
    const p = paletteFor(def);
    const svg = renderSvg(def, {
      time: 0.7,
      color: p.base,
      highlightColor: p.highlight,
      shadowColor: p.shadow,
      eyeColor: p.eye,
      clay: true,
      size: 96,
    });
    thumbSvg.set(def.id, svg);
    const button = document.querySelector<HTMLButtonElement>(`button[data-id="${def.id}"]`);
    if (button) button.innerHTML = svg;
    idle(step);
  };
  idle(step);
}

function updateMeta(): void {
  must<HTMLElement>('#avatar-name').textContent = current.name;
  must<HTMLElement>('#avatar-id').textContent = current.id;
  updateEmbedPreview();
}

function updateEmbedPreview(): void {
  const shapeAttr = current.id.startsWith('shape-') ? `shape="${current.id.slice(6)}"` : `shape="circle"`;
  const colorAttr = PALETTES.some((p) => p.id === currentPaletteId) ? `palette="${currentPaletteId}"` : `color="${customColor}"`;
  const attrs = [shapeAttr, colorAttr, `state="${state}"`, `size="${Math.min(180, size)}"`];
  if (moodMode !== 'auto') attrs.push(`mood="${moodMode}"`);
  if (!clay) attrs.push('clay="false"');
  if (orbit) attrs.push('orbit');
  if (badge !== 'none') attrs.push(`badge="${badge}"`);
  embedPreviewEl.textContent = `<grok-bot ${attrs.join(' ')}></grok-bot>`;
}

function select(def: AvatarDefinition): void {
  current = def;
  const p = paletteFor(def);
  currentPaletteId = p.id;
  customColor = p.base;
  colorInput.value = p.base;
  bot.setShape(def);
  bot.setPalette(p.id);
  bot.setView(0, 0);
  syncSwatches();
  markCurrent();
  updateMeta();
  const rect = stage.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    stage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ---------------------------------------------------------------------------
// 状态、表情与色板控件

const statePills = must<HTMLElement>('#state-pills');
function syncPills(): void {
  statePills.replaceChildren();
  for (const item of STATES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.textContent = item.label;
    button.title = item.hint;
    button.setAttribute('aria-checked', item.value === state ? 'true' : 'false');
    button.addEventListener('click', () => {
      state = item.value;
      bot.setState(state);
      syncPills();
      updateEmbedPreview();
    });
    statePills.append(button);
  }
}

const moodPills = must<HTMLElement>('#mood-pills');
function syncMood(): void {
  moodPills.replaceChildren();
  const autoBtn = document.createElement('button');
  autoBtn.type = 'button';
  autoBtn.setAttribute('role', 'radio');
  autoBtn.textContent = '自动轮换';
  autoBtn.title = '由双节奏状态机自动切换表情';
  autoBtn.setAttribute('aria-checked', moodMode === 'auto' ? 'true' : 'false');
  autoBtn.addEventListener('click', () => {
    moodMode = 'auto';
    bot.setMood('auto');
    syncMood();
    updateEmbedPreview();
  });
  moodPills.append(autoBtn);

  for (const value of EXPRESSIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', value === moodMode ? 'true' : 'false');
    button.textContent = MOOD_LABELS[value];
    button.addEventListener('click', () => {
      moodMode = value;
      bot.setMood(value);
      syncMood();
      updateEmbedPreview();
    });
    moodPills.append(button);
  }
}

const badgePills = must<HTMLElement>('#badge-pills');
function syncBadges(): void {
  badgePills.replaceChildren();
  for (const item of BADGES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.textContent = item.label;
    button.setAttribute('aria-checked', item.value === badge ? 'true' : 'false');
    button.addEventListener('click', () => {
      badge = item.value;
      bot.setBadge(badge);
      syncBadges();
      updateEmbedPreview();
    });
    badgePills.append(button);
  }
}

must<HTMLButtonElement>('#poke').addEventListener('click', () => {
  bot.poke();
});

const clayInput = must<HTMLInputElement>('#clay');
clayInput.addEventListener('change', () => {
  clay = clayInput.checked;
  bot.setClay(clay);
  updateEmbedPreview();
});

const orbitInput = must<HTMLInputElement>('#orbit');
orbitInput.addEventListener('change', () => {
  orbit = orbitInput.checked;
  bot.setOrbit(orbit);
  updateEmbedPreview();
});

const followInput = must<HTMLInputElement>('#follow');
followInput.addEventListener('change', () => {
  follow = followInput.checked;
  bot.setFollowPointer(follow);
});

const sleepInput = must<HTMLInputElement>('#sleep-idle');
sleepInput.addEventListener('change', () => {
  sleepIdle = sleepInput.checked;
  bot.setSleepWhenIdle(sleepIdle);
});

const reduceInput = must<HTMLInputElement>('#reduce');
reduceInput.checked = reduce;
reduceInput.addEventListener('change', () => {
  reduce = reduceInput.checked;
  bot.setReducedMotion(reduce);
});

const colorInput = must<HTMLInputElement>('#color');
colorInput.addEventListener('input', () => {
  customColor = colorInput.value;
  const derived = derivePalette(customColor);
  currentPaletteId = derived.id;
  bot.setPalette(customColor);
  syncSwatches();
  updateEmbedPreview();
});

const swatches = must<HTMLElement>('#swatches');
function syncSwatches(): void {
  swatches.replaceChildren();
  for (const p of PALETTES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.background = `radial-gradient(circle at 30% 30%, ${p.highlight}, ${p.base} 65%, ${p.shadow})`;
    button.title = p.name;
    button.setAttribute('aria-label', `${p.name} ${p.base}`);
    button.setAttribute('aria-current', p.id === currentPaletteId ? 'true' : 'false');
    button.addEventListener('click', () => {
      currentPaletteId = p.id;
      customColor = p.base;
      colorInput.value = p.base;
      bot.setPalette(p.id);
      syncSwatches();
      updateEmbedPreview();
    });
    swatches.append(button);
  }
}

const depthInput = must<HTMLInputElement>('#depth');
const depthOut = must<HTMLOutputElement>('#depth-out');
depthInput.addEventListener('input', () => {
  depth = Number(depthInput.value);
  depthOut.textContent = String(depth);
  bot.setDepth(depth);
});

const sizeInput = must<HTMLInputElement>('#size');
const sizeOut = must<HTMLOutputElement>('#size-out');
sizeInput.value = String(size);
sizeOut.textContent = String(size);
sizeInput.addEventListener('input', () => {
  size = Number(sizeInput.value);
  sizeOut.textContent = String(size);
  resizeStage();
  bot.setSize(size);
});

// ---------------------------------------------------------------------------
// 导入 / 导出

const importEl = must<HTMLTextAreaElement>('#import');
const errorsEl = must<HTMLElement>('#import-errors');

const addError = (message: string) => {
  const li = document.createElement('li');
  li.textContent = message;
  errorsEl.append(li);
};

must<HTMLButtonElement>('#import-add').addEventListener('click', () => {
  errorsEl.replaceChildren();
  let parsed: unknown;
  try {
    parsed = JSON.parse(importEl.value);
  } catch (err) {
    addError(`JSON 解析失败：${(err as Error).message}`);
    return;
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const accepted: AvatarDefinition[] = [];
  for (const [i, item] of items.entries()) {
    const res = validateAvatar(item);
    if (res.ok) accepted.push(res.value);
    else for (const message of res.errors) addError(`${items.length > 1 ? `#${i + 1} ` : ''}${message}`);
  }
  if (!accepted.length) return;
  const existing = new Set(yours.map((d) => d.id));
  for (const def of accepted) {
    const at = yours.findIndex((d) => d.id === def.id);
    if (at >= 0) yours[at] = def;
    else yours.push(def);
    if (!existing.has(def.id)) thumbSvg.delete(def.id);
  }
  saveYours(yours);
  buildGallery();
  upgradeThumbnails();
  select(accepted[accepted.length - 1]);
  importEl.value = '';
});

must<HTMLButtonElement>('#import-export').addEventListener('click', () => {
  importEl.value = JSON.stringify({ ...current, body: { path: current.body.path } }, null, 2);
  importEl.focus();
  importEl.select();
});

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

must<HTMLButtonElement>('#download-svg').addEventListener('click', () => {
  download(`${current.id}.svg`, new Blob([bot.toSvg(512)], { type: 'image/svg+xml' }));
});

must<HTMLButtonElement>('#download-png').addEventListener('click', () => {
  const px = 1024;
  const svg = bot.toSvg(px);
  const image = new Image();
  image.onload = () => {
    const out = document.createElement('canvas');
    out.width = px;
    out.height = px;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, px, px);
    out.toBlob((blob) => {
      if (blob) download(`${current.id}.png`, blob);
    }, 'image/png');
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});

async function copyText(buttonId: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    const button = must<HTMLButtonElement>(buttonId);
    const prev = button.textContent;
    button.textContent = '已复制';
    setTimeout(() => {
      button.textContent = prev;
    }, 1400);
  } catch {
    importEl.value = text;
    importEl.focus();
    importEl.select();
  }
}

must<HTMLButtonElement>('#copy-prompt').addEventListener('click', () => copyText('#copy-prompt', DESIGN_PROMPT));
must<HTMLButtonElement>('#copy-embed').addEventListener('click', () => copyText('#copy-embed', embedPreviewEl.textContent ?? ''));

// ---------------------------------------------------------------------------
// 启动

updateMeta();
syncSwatches();
syncPills();
syncMood();
syncBadges();
buildGallery();
upgradeThumbnails();
