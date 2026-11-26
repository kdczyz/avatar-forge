# Grok 风格头像引擎（`src/bot/`）公开接口文档

> 覆盖范围：`src/bot/` 下全部 9 个 `.ts` 文件（共 1869 行），逐个读取源码后整理。
> 签名均与源码一致；默认参数、可选参数、返回类型按原样保留。未显式标注返回类型的成员已注明「推断」。
> 行号引用格式：`文件名:L行号`。核心层类型来自 `src/core/types.ts` 等，仅在签名涉及时给出定义，不属于本文导出范围。

---

## 0. 总览

### 0.1 文件与职责

| 文件 | 职责 | 关键导出 |
| --- | --- | --- |
| `index.ts` | 公共桶文件（barrel），全量再导出其余 8 个模块 | 8 条 `export *`（`index.ts:L8-L15`） |
| `ring.ts` | 48 点闭合眼环拓扑、15 种表情库、插值、SVG 路径 | `Pt` `EyeRing` `EyePair` `RingParams` `POINT_COUNT` `EXPRESSIONS` `ENVELOPE_N` `RING_ENVELOPE` + 8 个函数 |
| `spring.ts` | 三缓冲 + 二阶阻尼弹簧、眨眼、视线低通滤波 | `SpringOptions` `SpringEyeEngine` |
| `scheduler.ts` | 双节奏状态机（表情轮换 / 独立眨眼）、poke、休眠唤醒 | `StateCadence` `STATE_CADENCES` `SchedulerOptions` `BotScheduler` |
| `shapes.ts` | 9 种标准化躯干（归一化顶点 + `AvatarDefinition`） | `ShapeId` `CanonicalShape` `SHAPES` `findShape` |
| `palettes.ts` | 12 套黏土色板 + OKLCH 派生 | `BotPalette` `PALETTES` `DEFAULT_PALETTE` `findPalette` `derivePalette` |
| `effects.ts` | 轨道粒子与通知角标的纯几何数据 | `OrbitPiece` `BadgePiece` `orbitPieces` `badgePiece` |
| `clay.ts` | Canvas 2D / SVG 伪 3D 黏土高光与内阴影 | `ClayScratch` `createClayScratch` `applyClayToCanvas` `svgClayFilter` |
| `grok-bot.ts` | 无框架控制器 `GrokBot` + Web Component `<grok-bot>` | `GrokBotOptions` `GrokBot` `GrokBotElement` `registerGrokBot` |

### 0.2 核心类型契约（被引用的外部类型）

- `AvatarMood`（15 种）：`'neutral' | 'happy' | 'joy' | 'love' | 'surprised' | 'curious' | 'skeptical' | 'sleepy' | 'bored' | 'sad' | 'angry' | 'focused' | 'confused' | 'shy' | 'smug'`（`src/core/types.ts:L34-L49`）
- `AvatarState`：`'idle' | 'thinking' | 'working' | 'waiting' | 'blocked' | 'done' | 'alert'`（`src/core/types.ts:L29`）
- `BadgeKind`：`'none' | 'red' | 'blue'`（`src/core/types.ts:L51`）
- `AvatarDefinition`：`{ version: 1; id: string; name: string; body: { path: string }; eyes: { x: number; y: number; spacing: number; scale: number } }`（`src/core/types.ts:L18-L27`、`src/core/types.ts:L8-L16`）
- `PoseLike`：19 字段数值姿态（`yaw/pitch/roll/lift/sx/sy/gazeX/gazeY/blink/squintL/squintR/eyes/ribbons/cage/sweep/bang/dots/bloom/bloomAge`，`src/core/types.ts:L127-L149`）
- `RenderOptions`：`src/core/types.ts:L58-L100`，含 `color/highlightColor/shadowColor/eyeColor/size/depth/clay/view/time/gaze/state/mood/stateAge/reducedMotion/expression/poseBlend/eyeRings/blinkScale/orbit/badge`
- `Bounds`：`{ minX; minY; maxX; maxY: number }`（`src/core/path.ts:L18-L23`）
- `Box`：`{ x; y; w; h: number }`（`src/core/fx.ts:L20-L25`）
- `Rim`：`{ cx: number; cy: number; at: (angle: number) => number; max: number }`（`src/core/fx.ts:L34-L39`）
- `Surface`：`{ canvas; ctx; cap; fit; layout; left; top; clay }`（`src/core/paint.ts:L133-L142`）
- `Rgb`：来自 `src/core/color.ts`，形如 `[r, g, b]`（由 `palettes.ts:L5` 的导入推知）

---

## 1. `index.ts` — 公共入口

全量再导出，无自有符号（`index.ts:L8-L15`）：

```ts
export * from './ring.ts';        // L8
export * from './spring.ts';      // L9
export * from './scheduler.ts';   // L10
export * from './shapes.ts';      // L11
export * from './palettes.ts';    // L12
export * from './effects.ts';     // L13
export * from './clay.ts';        // L14
export * from './grok-bot.ts';    // L15
```

> 所有模块内 import 均带 `.ts` 扩展名（如 `ring.ts:L10`），消费方需使用支持 `allowImportingTsExtensions` 的 TS/bundler 配置。

---

## 2. `ring.ts` — 48 点闭合眼环

坐标单位：viewBox，`eyes.scale = 1` 下中性眼约宽 4、高 11；索引 0 固定在 3 点钟方向，顺时针（y 向下）排列（`ring.ts:L2-L9`）。

### 2.1 类型 / 接口

```ts
export interface Pt { x: number; y: number; }                    // L12-L15
export type EyeRing = Pt[];                                      // L16
export type EyePair = [EyeRing, EyeRing];                        // L17  约定 [左眼, 右眼]

export interface RingParams {                                    // L22-L45
  rx: number;                 // 半宽（必填）
  ry: number;                 // 半高（必填）
  n?: number;                 // 超椭圆指数，2 = 椭圆，默认 2.6
  squintTop?: number;         // 上半区压扁 0..1
  squintBottom?: number;      // 下半区压扁 0..1
  bend?: number;              // 抛物线弯曲 y += bend·(x/rx)²，正值两端下垂
  lid?: { y: number; slope?: number };    // 上眼睑切线，线以上的点压到线上
  floor?: { y: number; slope?: number };  // 下眼睑切线，线以下的点压到线上
  shear?: number;             // 斜切 x += shear·y
  tilt?: number;              // 旋转（弧度，正 = 顺时针）
  dx?: number;                // 整体平移
  dy?: number;                // 整体平移
}
```

### 2.2 常量

| 常量 | 类型 / 值 | 说明 | 行号 |
| --- | --- | --- | --- |
| `POINT_COUNT` | `48` | 每只眼的顶点数 | `ring.ts:L19` |
| `EXPRESSIONS` | `readonly AvatarMood[]` | `LIBRARY` 的 15 个键 | `ring.ts:L157` |
| `ENVELOPE_N` | `2.6` | 所有表情外包络的超椭圆指数 | `ring.ts:L185` |
| `RING_ENVELOPE` | 推断为 `{ hw: number; hh: number }` | 遍历 `LIBRARY` 所有点求轴对齐最大半宽/半高，再乘 1.06 / 1.04；渲染器据此估算眼睛深度半宽 | `ring.ts:L186-L199` |

### 2.3 函数

```ts
export function createEyeRing(p: RingParams): EyeRing;                       // L48-L72
```
按 θᵢ = 2πi/48 采样超椭圆，依次施加 squint → bend → lid → floor → shear，最后 `transform` 施加 tilt/dx/dy（`ring.ts:L49-L71`）。

```ts
export function ringFromPolygon(poly: Pt[], origin: Pt = { x: 0, y: 0 }): EyeRing;  // L84-L105
```
任意「关于原点星形」闭合折线 → 48 点眼环；沿各 θᵢ 发射线取最远交点（射线/线段求交，分母 < 1e-12 跳过，`ring.ts:L96-L100`）。

```ts
export function heartRing(halfWidth: number, dy = 0): EyeRing;                // L108-L117
```
160 点心形参数方程 → `ringFromPolygon` 重排；整体 y 偏移 `0.1 * halfWidth + dy`。

```ts
export function mirrorRing(ring: EyeRing): EyeRing;                           // L123-L130
```
左右镜像且保持索引约定：第 i 点取原环 `(48/2 − i)` 点，x 取负（模 48 归一化）。

```ts
export function expressionRings(mood: AvatarMood | string | undefined): EyePair;  // L160-L164
```
返回目标眼环深拷贝；`'grumpy'` 回落到 `'angry'`，未知值回落 `'neutral'`（`ring.ts:L161-L163`）。

```ts
export function lerpPair(a: EyePair, b: EyePair, t: number, out?: EyePair): EyePair;  // L166-L175
```
逐点线性插值；`out` 省略时分配新 pair，提供时**原地写入**并返回（弹簧引擎用此复用 display 缓冲）。

```ts
export function clonePair(p: EyePair): EyePair;                               // L177-L179

export function ringPath(
  ring: EyeRing,
  cx: number,
  cy: number,
  scale: number,
  blink = 1,
  dx = 0,
  dy = 0
): string;                                                                   // L210-L219
```
眼环 → 光滑闭合 SVG 路径：每顶点一条二次曲线 `Q`，在边中点相接，以 `M` 起、`Z` 收；坐标 `cx+dx+ring.x*scale`、`cy+dy+ring.y*scale*blink`，数值保留两位小数。

### 2.4 内部实现（非导出，供理解）

- `TAU = Math.PI * 2`（`L20`）、`transform()`（`L74-L78`）、`pair()`（`L133-L136`，左眼参数 → 右眼镜像）、`LIBRARY: Record<AvatarMood, EyePair>`（`L139-L155`，15 种表情定义）、`fmt()`（`L201-L204`）。

---

## 3. `spring.ts` — 二阶阻尼弹簧眼引擎

三缓冲：`source`（触发瞬间深拷贝 `display`，支持随时打断不跳帧）、`target`（目标表情）、`display`（每帧输出）（`spring.ts:L2-L6`）。

### 3.1 类型 / 接口

```ts
export interface SpringOptions {        // L14-L25
  stiffness?: number;     // 刚度 k，建议 180..260，默认 220
  damping?: number;       // 阻尼 c，建议 16..22，默认 18
  blinkDuration?: number; // 单次眨眼秒数，默认 0.15
  blinkMinScale?: number; // 最扁纵向缩放，默认 0.08
  lookRate?: number;      // 视线低通速率 1/s，默认 10
}
```

### 3.2 `class SpringEyeEngine`（`spring.ts:L34-L196`）

**构造函数**（`spring.ts:L54-L66`）：
```ts
constructor(initialMood: AvatarMood = 'neutral', options: SpringOptions = {})
```
按 options 设置刚度/阻尼/眨眼/视线参数（默认值见 3.1），用 `expressionRings(initialMood)` 初始化 source/target/display 三个缓冲。

**公开属性 / getter：**

| 成员 | 签名 | 说明 | 行号 |
| --- | --- | --- | --- |
| `mood` | `get mood(): AvatarMood` | 当前表情 | `L68-L70` |

**公开方法：**

```ts
setExpression(mood: AvatarMood, immediate = false): void;      // L73-L91
```
同表情且已收敛时短路返回（`springX > 0.999 && |springV| < 0.01`）；`immediate` 时三缓冲全部置为目标并重置速度；否则 `source = clonePair(display)`、`target = 新表情`、`springX = 0`、`springV = 0`。

```ts
triggerBlink(doubleBlink = false, duration = this.blinkDuration): void;  // L94-L100
```
`duration` 下限 0.08；`doubleBlink` 时设 `nextDelay = 0.08` 排队第二下。

```ts
setLookTarget(x: number, y: number, immediate = false): void;   // L103-L108
```
归一化并钳制到 [-1,1]；非有限值归 0；`immediate` 同步 current。

```ts
update(dt: number, reducedMotion = false): void;               // L111-L175
```
`dt` 钳制到 [0, 0.05] 秒。`reducedMotion` 时：display 直接取 target、眨眼清空、视线瞬移并立即返回（`L114-L126`）。常规路径三步：① 弹簧子步积分（最多 `ceil(dt/(1/120))` 步，力 `-k(x-1)-c·v`，收敛后置 `x=1,v=0`，随后 `lerpPair(source,target,springX,display)`，`L128-L143`）；② 独立眨眼缩放 `1-(1-min)·sin(πu)` 含连眨排队（`L145-L167`）；③ 视线指数平滑 `alpha = 1-exp(-lookRate·clamped)`，差值 < 5e-4 时吸附（`L169-L174`）。

```ts
getRings(): EyePair;          // L177-L179  返回 display（内部引用，非拷贝）
getBlinkScale(): number;      // L181-L183
getLookOffset(): Pt;          // L185-L187  返回新对象 {x,y}
isSettled(): boolean;         // L190-L195  弹簧、眨眼、视线三者均收敛时为 true，供外层休眠降帧
```

---

## 4. `scheduler.ts` — 双节奏状态机调度

两条独立计时器：表情轮换 + 眨眼；`poke` 瞬时反应与 `setMood` 手动锁定均可无缝接入并驱动 `SpringEyeEngine`（`scheduler.ts:L1-L8`）。

### 4.1 类型 / 接口与常量

```ts
export interface StateCadence {                       // L12-L20
  pool: readonly AvatarMood[];        // 该状态的表情池
  moodInterval: [number, number];     // 表情切换区间（秒）
  blinkInterval: [number, number];    // 眨眼间隔区间（秒）
  blinkDuration: number;              // 眨眼时长（秒）
}

export const STATE_CADENCES: Record<AvatarState, StateCadence>;  // L22-L65
```
7 个状态的具体配置（`scheduler.ts:L23-L64`）：

| 状态 | pool | moodInterval | blinkInterval | blinkDuration |
| --- | --- | --- | --- | --- |
| `idle` | neutral, happy, curious, shy, sleepy | [3.2, 6.8] | [2.2, 3.8] | 0.15 |
| `thinking` | curious, skeptical, focused, confused | [3.5, 7.0] | [2.4, 4.2] | 0.16 |
| `working` | focused, smug, joy, neutral | [2.8, 5.5] | [1.9, 3.2] | 0.13 |
| `waiting` | bored, sleepy, shy, curious | [3.8, 7.2] | [2.8, 4.8] | 0.22 |
| `blocked` | sad, confused, angry | [2.4, 4.8] | [2.2, 3.6] | 0.15 |
| `done` | joy, love, happy | [2.0, 4.2] | [2.0, 3.4] | 0.14 |
| `alert` | surprised, angry, focused | [1.8, 3.5] | [1.6, 2.8] | 0.12 |

内部常量 `POKE_POOL = ['surprised','love','shy','curious','joy','angry']`（`L67`，非导出）。

```ts
export interface SchedulerOptions {           // L69-L76
  state?: AvatarState;
  mood?: AvatarMood | null;   // 指定则锁定；null/undefined 时自动轮换
  spring?: SpringOptions;
  rng?: () => number;         // 确定性伪随机源，默认 Math.random
}
```

### 4.2 `class BotScheduler`（`scheduler.ts:L78-L239`）

**公开属性：**
```ts
readonly eyes: SpringEyeEngine;   // L79
```

**构造函数**（`scheduler.ts:L90-L99`）：
```ts
constructor(options: SchedulerOptions = {})
```
初始化 `rng`、状态、锁定表情；`activeMood = lockedMood ?? cadence.pool[0]`；构造 `SpringEyeEngine(activeMood, options.spring)`；两个计时器分别按 cadence 区间随机取初值。

**getter：**

| 成员 | 签名 | 说明 | 行号 |
| --- | --- | --- | --- |
| `state` | `get state(): AvatarState` | 当前业务状态 | `L101-L103` |
| `lockedMood` | `get lockedMood(): AvatarMood \| null` | 锁定的表情 | `L105-L107` |
| `activeMood` | `get activeMood(): AvatarMood` | 正在呈现的表情（含轮换/poke） | `L110-L112` |
| `stateAge` | `get stateAge(): number` | 状态已持续秒数 | `L114-L116` |

**公开方法：**

```ts
setState(next: AvatarState, immediate = false): void;      // L127-L139
```
相同状态直接返回；重置 `stateAge` 与两计时器；未锁定且无 burst 时切到新状态 pool 的第 0 个表情。

```ts
setMood(mood: AvatarMood | null, immediate = false): void; // L142-L155
```
非 null：清 burst 并锁定；null：解除锁定，从当前状态 pool 中排除当前表情随机抽一个，重置 moodTimer。

```ts
setGazeTarget(x: number, y: number, immediate = false): void;  // L158-L160  转发给 eyes
poke(mood?: AvatarMood, durationSec = 1.6): AvatarMood;        // L163-L169
```
从 `POKE_POOL` 排除当前表情随机抽（或指定），设 `burst = { mood, remaining: max(0.3, durationSec) }`，立即切表情并返回所选 mood。

```ts
blink(doubleBlink = false): void;                  // L172-L176
```
按当前状态 cadence 的 `blinkDuration` 触发并重置 blinkTimer。

```ts
update(dt: number, reducedMotion = false): void;   // L179-L217
```
`dt` 钳制到 [0, 0.05]；`stateAge += dt`。非 reducedMotion 下依次：① burst 倒计时，到点回落 `lockedMood ?? pool 随机`（`L186-L194`）；② 未锁定且无 burst 时 moodTimer 递减，到点从 pool 排除当前表情轮换（`L197-L205`）；③ blinkTimer 递减，到点眨眼，`rng() > 0.82` 时连眨（`L208-L213`）。最后无论何种模式都调用 `this.eyes.update(clamped, reducedMotion)`（`L216`）。

```ts
nextWakeDelayMs(): number;       // L223-L229
```
收集 blinkTimer（+ 未锁定时的 moodTimer、burst 剩余），取最小值并向下钳 `0.04` 秒，四舍五入为毫秒。

```ts
advanceSleep(elapsedSec: number): void;  // L232-L238
```
休眠唤醒快进：推进 `stateAge`，按情况递减 burst/moodTimer/blinkTimer（均下限 0）。

---

## 5. `shapes.ts` — 标准化躯干库

文件头注释称 8 种，实际 `ShapeId` 与 `SHAPES` 含 **9 种**（`circle/sphere/squircle/hexagon/cloud/capsule/droplet/star/blob`，`shapes.ts:L11`、`L162-L271`）。

### 5.1 类型 / 接口

```ts
export type ShapeId = 'circle' | 'sphere' | 'squircle' | 'hexagon' | 'cloud'
                    | 'capsule' | 'droplet' | 'star' | 'blob';    // L11

export interface CanonicalShape {          // L13-L20
  id: ShapeId;
  name: string;
  unitPoints: Pt[];            // 归一化到 [-1,1] 的闭合采样点，跨端几何复用
  definition: AvatarDefinition;// 标准 100×100 定义
}
```

### 5.2 常量与函数

```ts
export const SHAPES: readonly CanonicalShape[];   // L162-L271（as const）
export function findShape(id: string | undefined): CanonicalShape | undefined;  // L273-L277
```
`findShape` 先 `trim().toLowerCase()` 并剥离前缀 `shape-`，再按 id 查找（`L275-L276`）。

各形状的 `definition.eyes`（`L167-L270`）：

| id | eyes 中心 (x,y) | spacing | scale |
| --- | --- | --- | --- |
| circle / sphere | (50,48) | 18 | 1.15 / 1.12 |
| squircle | (50,48) | 18 | 1.15 |
| hexagon | (50,49) | 17 | 1.1 |
| cloud | (50,52) | 17 | 1.05 |
| capsule | (50,49) | 18 | 1.1 |
| droplet | (50,57) | 16 | 1.08 |
| star | (50,51) | 15 | 0.96 |
| blob | (50,50) | 18 | 1.15 |

内部辅助（非导出）：`polygonToRoundedPath`（`L25-L50`）、`catmullRomPath`（`L52-L67`）、`sampleCircleUnit`（`L69-L74`）、`sampleSuperellipseUnit`（`L76-L86`）、`unitToPath`（`L88-L91`）、`normalizePoints`（`L93-L105`）。

---

## 6. `palettes.ts` — 黏土色板

### 6.1 类型 / 接口

```ts
export interface BotPalette {   // L7-L20，全部 string
  id: string;
  name: string;
  base: string;       // 躯干底层主色
  highlight: string;  // 左上角高光（径向渐变起始）
  shadow: string;     // 右下角内阴影
  eye: string;        // 眼睛颜色
  accent: string;     // 轨道粒子/强调色
}
```

### 6.2 常量与函数

```ts
export const PALETTES: readonly BotPalette[];          // L22-L35，12 套预设
export const DEFAULT_PALETTE = PALETTES[0];             // L37  → coral
export function findPalette(idOrColor: string | undefined): BotPalette | undefined;  // L40-L44
export function derivePalette(baseColor: string, id = 'custom', name = 'Custom'): BotPalette;  // L47-L62
```

12 套预设 id（`palettes.ts:L23-L34`）：`coral`(赤陶橙 #ff6a1a)、`cobalt`(钴蓝)、`emerald`(薄荷翠)、`amber`(琥珀金)、`crimson`(绯红)、`violet`(暮紫)、`teal`(深海青)、`rose`(蔷薇粉)、`indigo`(靛青)、`lime`(青柠)、`obsidian`(黑曜石)、`pearl`(陶瓷白)。

`findPalette` 按 id 或 base hex（均转小写）匹配。`derivePalette` 命中预设直接返回；否则 `parseHex` 解析（非法回落 `DEFAULT_PALETTE.base`），在 OKLCH 空间由 `L/C/H` 派生：高光 `L+(1-L)*0.58, C*0.45, H+8`；阴影 `max(0.16, L*0.46), min(0.24, C*0.95), H-12`；强调色 `min(0.84, L+0.14), max(0.1, C*0.85), H+16`；眼色取 `autoEyeColor(rgb)`（`palettes.ts:L50-L61`）。

---

## 7. `effects.ts` — 外围图层动效几何

输出 viewBox 单位纯几何数据，由 `core/frame.ts` 统一参与前后景深度排序（`effects.ts:L1-L4`）。

### 7.1 类型 / 接口

```ts
export interface OrbitPiece {                          // L17-L23
  d: string;                                           // 圆形路径
  box: Box;                                            // {x,y,w,h}
  matrix: [number, number, number, number, number, number];  // [scale,0,0,scale,x,y]
  fill: string;
  front: boolean;                                      // z3 >= 0 → 前景
}

export interface BadgePiece {                          // L75-L82
  x: number;
  y: number;
  radius: number;   // 固定 6.2
  fill: string;     // red → '#ef4444'，其余 → '#3b82f6'
  ringFill: string; // '#fffcf7'
  pulse: number;    // reducedMotion 时 1，否则 1 + 0.09·sin(4.2t)
}
```

### 7.2 函数

```ts
export function orbitPieces(
  rim: Rim,
  seed: number,
  time: number,
  state: AvatarState,
  palette: readonly string[],
  reducedMotion: boolean,
): OrbitPiece[];                                       // L28-L73
```
固定 6 粒子、两条倾斜椭圆轨道；速度按 state：working 1.55 / thinking 0.95 / alert 1.8 / 其余 0.65；reducedMotion 时 `t = 0`；轨道倾角、滚转角、半径、相位由 `noise(seed, n)` 扰动（`L44-L47`）；3D 投影后按 z 判前后景，半径随深度缩放（`L50-L70`）。

```ts
export function badgePiece(
  b: Bounds,
  badge: BadgeKind | undefined,
  time: number,
  reducedMotion: boolean,
): BadgePiece | null;                                  // L87-L100
```
`badge` 为空或 `'none'` 返回 `null`；锚点 `x = min(91, b.maxX-3)`、`y = max(9, b.minY+3)`。

---

## 8. `clay.ts` — 伪 3D 黏土质感

Canvas 2D 与 SVG 通用；左上角高光 + 右下角内阴影（离屏偏移纯阴影，不回绘黑色遮罩像素，避免抗锯齿边缘发黑，`clay.ts:L1-L6`）。

### 8.1 类型 / 接口

```ts
export interface ClayScratch {              // L18-L25
  body: HTMLCanvasElement;
  bodyCtx: CanvasRenderingContext2D;
  mask: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
  front: HTMLCanvasElement;
  frontCtx: CanvasRenderingContext2D;
}
```

### 8.2 函数

```ts
export function createClayScratch(): ClayScratch | null;   // L27-L37
```
无 `document` 或任一 `getContext('2d')` 失败时返回 `null`；创建三张离屏 canvas。

```ts
export function applyClayToCanvas(
  scratch: ClayScratch,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  highlightHex: string,
  shadowHex: string,
): void;                                                  // L45-L109
```
共 9 个参数。`(cx,cy)`/`(rx,ry)` 为当前视角下身体投影中心与半宽高（设备像素）。`width/height <= 0` 或 `max(rx,ry) <= 1` 时直接返回。步骤：① `source-atop` 径向渐变高光，中心 `(cx-rx*0.25, cy-ry*0.25)`，透明度 0.46 → 0.16 → 0（`L62-L72`）；② 离屏 mask（`destination-out` 抠出 body）+ 远距 `SHADOW_SHIFT = 10000` 偏移只投纯阴影，`blur = max(2, rRim*0.22)`、`off = rRim*0.14`、阴影色 alpha 0.52（`L74-L98`）；③ 左上方柔和高光边缘 alpha 0.28（`L100-L106`）。

```ts
export function svgClayFilter(id: string, highlightHex: string, shadowHex: string): string;  // L115-L135
```
返回完整 `<filter id="...">` 字符串：两次 `feGaussianBlur`+`feOffset`+`feComposite(out)`+`feFlood`+`feComposite(in)` 分别生成 innerShadow（flood-opacity 0.48，dx/dy -3.2，stdDeviation 3.2）与 innerHighlight（0.42，dx/dy 3.4，stdDeviation 2.6），最后 `feMerge` 合成 SourceGraphic + 两者。纯矢量，可无损缩放。

内部 `hexToRgba(hex, alpha)`（`L8-L16`）：仅接受 `#rrggbb`，否则回落 `rgba(0,0,0,alpha)`。

---

## 9. `grok-bot.ts` — 控制器与 Web Component

### 9.1 `GrokBotOptions`（`grok-bot.ts:L21-L46`）

```ts
export interface GrokBotOptions {
  container?: HTMLElement;          // 传入则内部创建包装 div + canvas
  canvas?: HTMLCanvasElement;       // 或直接复用现成 canvas（需在可定位容器内）
  definition?: AvatarDefinition;
  shape?: ShapeId;
  palette?: string;
  color?: string;
  eyeColor?: string;
  size?: number;
  depth?: number;
  clay?: boolean;
  state?: AvatarState;
  mood?: AvatarMood | 'auto' | null;
  orbit?: boolean;
  badge?: BadgeKind;
  followPointer?: boolean;
  interactive?: boolean;
  reducedMotion?: boolean;
  sleepWhenIdle?: boolean;          // 默认 false
  observeVisibility?: boolean;      // 默认 true，离开视口自动暂停
  onFrame?: (info: {
    mood: AvatarMood;
    sleeping: boolean;
    visible: boolean;
    fps: number;
  }) => void;                       // L45
}
```

### 9.2 `class GrokBot`（`grok-bot.ts:L48-L497`）

**公开只读属性**（`L49-L51`）：
```ts
readonly canvas: HTMLCanvasElement;
readonly wrapper: HTMLElement;
readonly scheduler: BotScheduler;
```

**构造函数**（`grok-bot.ts:L90-L135`）：
```ts
constructor(options: GrokBotOptions)
```
流程：① `definition ?? findShape(shape)?.definition ?? SHAPES[0].definition` → `validateAvatar` 校验，失败抛 `Invalid avatar definition: ...`（`L91-L94`）；② `derivePalette(options.palette ?? options.color ?? '#ff6a1a')`；③ 各项默认值：`size = max(24, size ?? 160)`、`depth = 6`、`clay = true`、`orbit = false`、`badge = 'none'`、`followPointer = true`、`interactive = true`、`reducedMotion` 默认读 `prefers-reduced-motion`、`sleepWhenIdle = false`（`L96-L107`）；④ canvas 来源二选一，都没有抛 `GrokBot requires either container or canvas`（`L109-L122`）；⑤ `mood === 'auto'` 视为 `null`（不锁定），构造 `BotScheduler`（`L124-L128`）；⑥ `mountCanvas` → `applyWrapperSize` → `bindEvents(observeVisibility !== false)` → `renderOnce()` → `wake()`（`L130-L134`）。

**生命周期 / 渲染：**

```ts
wake(): void;                                 // L245-L258
```
销毁或不可见时返回；清 wakeTimer；置 `sleeping = false`；无 rafId 时重置 fps 计数并发起 `requestAnimationFrame(this.tick)`。

```ts
renderOnce(now = performance.now()): void;    // L358-L362
```
`computeFrame(def, currentRenderOptions(undefined, now), size)` → 缓存 `lastPose = frame.pose` → `paintFrame(surface, frame, size)`。

```ts
destroy(): void;                              // L490-L496
```
置 `destroyed`、暂停循环、`io.disconnect()`、逐个执行 `cleanupListeners` 并清空。

**公共控制 API：**

```ts
setState(state: AvatarState): void;                       // L367-L372
setMood(mood: AvatarMood | 'auto' | null): void;          // L374-L378（'auto' → null）
setShape(shapeOrDef: ShapeId | AvatarDefinition): void;   // L380-L391
setPalette(idOrColor: string): void;                      // L393-L396
setEyeColor(hex: string | undefined): void;               // L398-L401
setSize(px: number): void;                                // L403-L407（下限 24）
setDepth(depth: number): void;                            // L409-L413（remountCanvas）
setClay(clay: boolean): void;                             // L415-L418
setOrbit(orbit: boolean): void;                           // L420-L423
setBadge(badge: BadgeKind): void;                         // L425-L428
setFollowPointer(follow: boolean): void;                  // L430-L436（关闭时 gaze 归零）
setReducedMotion(reduced: boolean): void;                 // L438-L443
setSleepWhenIdle(sleep: boolean): void;                   // L445-L448（随后 wake）
setView(yaw: number, pitch: number, immediate = false): void; // L450-L458
setGaze(x: number, y: number): void;                      // L460-L463
poke(mood?: AvatarMood): AvatarMood;                      // L465-L470
toSvg(px = 512): string;                                  // L472-L474
getDefinition(): AvatarDefinition;                        // L476-L478
destroy(): void;                                          // L490-L496
```

关键行为补充：
- `setState` 同状态直接返回；切换时 `beginBlend()` 捕获上一帧姿态做 420ms 过渡，随后 `scheduler.setState(state, reducedMotion)` 与 `scheduleRender()`（`L367-L372`）。
- `setShape` 校验新定义；若 id 与 body.path 均未变则直接返回；否则 `remountCanvas` 重建切片表面（`L380-L391`）。
- `setReducedMotion(true)` 会清空 `blendFrom` 并以 `update(0, true)` 立即收敛物理状态（`L438-L443`）。
- `setView`：立即模式或 reducedMotion 时直写 `view` 并清 `viewTarget`；否则设目标由 `tick` 以 `k = 1-exp(-12·dt)` 平滑（`L450-L458`、`L275-L288`）。
- `toSvg` 复用 `currentRenderOptions(px)` 但强制 `reducedMotion: true`，输出静态 SVG（`L472-L474`）。

**`getState()`**（`grok-bot.ts:L480-L488`，源码未写返回类型标注，推断为）：
```ts
getState(): {
  state: AvatarState;
  mood: AvatarMood;
  lockedMood: AvatarMood | null;
  sleeping: boolean;
  visible: boolean;
}
```

**私有成员（非公开 API，供数据流理解）**：`beginBlend(now = performance.now())`（`L233-L236`）、`scheduleRender()`（`L239-L242`）、`pauseLoop()`（`L221-L230`）、`tick = (now: number) => void`（`L260-L328`）、`currentRenderOptions(px?, now?)`（`L330-L355`）、`applyWrapperSize()`（`L137-L141`）、`bindEvents(observeVisibility)`（`L143-L219`）。常量 `BLEND_MS = 420`（`L19`）。

`tick` 核心逻辑（`L260-L328`）：钳制 dt → `scheduler.update(dt, reducedMotion)`，若 mood 变化则 `beginBlend` → 视角平滑 → `renderOnce(now)` → 每 500ms 更新 fps → 判定 `canSleep`（reducedMotion，或 `sleepWhenIdle && state==='idle' && !orbit && badge==='none' && !dragging && !blendFrom && !viewTarget && !dirty && eyes.isSettled()`，`L300-L310`）→ 睡眠时置 `sleeping=true`、停 rAF、以 `nextWakeDelayMs()` 设定 `wakeTimer` 并在唤醒时 `advanceSleep(delayMs/1000)`；否则每帧回调 `onFrame` 并续帧。

`currentRenderOptions` 桥接（`L331-L354`）：把 `palette.base/highlight/shadow`、眼色（`eyeColorOverride ?? palette.eye ?? DEFAULT_EYE_COLOR`）、`depth/clay/size/time`、调度器状态与 `stateAge/activeMood`、视线 `{x,y,weight:1}`、`view`、以及 `scheduler.eyes.getRings()` / `getBlinkScale()` 组装成 `RenderOptions`；`poseBlend` 由 `blendFrom.pose` 与 `BLEND_MS` 进度生成，进度到 1 时清空。

事件绑定（`L143-L219`）：全局 `pointermove`（passive）驱动拖拽视角或 `setGazeTarget`（`followPointer` 关闭时归零）；`interactive` 时为 wrapper 绑定 `pointerdown/up/cancel`（含 `setPointerCapture` 与 `touchAction='none'`），轻点（位移 ≤ 3px）触发 `poke()`；`IntersectionObserver`（threshold 0.01）控制可见性与暂停/唤醒。

### 9.3 `class GrokBotElement extends HTMLElement`（`grok-bot.ts:L519-L620`）

```ts
static observedAttributes = [...ATTRS];   // L520
```
`ATTRS`（`L502-L517`，非导出）共 14 个：`shape, color, palette, eye-color, state, mood, size, depth, clay, orbit, badge, follow, sleep-idle, reduced-motion`。

**生命周期：**

| 方法 | 签名 | 行为 | 行号 |
| --- | --- | --- | --- |
| `connectedCallback` | `(): void` | 首次连接时 `attachShadow({mode:'open'})`，注入 `:host` 样式与挂载 div；随后 `new GrokBot({container: mountEl, ...})` | `L524-L550` |
| `disconnectedCallback` | `(): void` | `bot.destroy()` 并置 null | `L552-L555` |
| `attributeChangedCallback` | `(name: string, _oldVal: string \| null, newVal: string \| null): void` | 按属性名转发到对应 setter，见下表 | `L557-L601` |

**公开方法 / getter：**

```ts
poke(mood?: AvatarMood): AvatarMood | undefined;  // L603-L607
```
转发 `bot.poke(mood)`；成功时派发 `CustomEvent('grok-poke', { detail: { mood: res } })`。

```ts
setDefinition(def: AvatarDefinition): void;   // L609-L611   转发 setShape(def)
toSvg(px = 512): string;                      // L613-L615   无实例时返回 ''
get instance(): GrokBot | null;               // L617-L619
```

**Attributes → setter 映射**（`grok-bot.ts:L557-L600`）：

| attribute | 初始值（connectedCallback） | 变更处理 |
| --- | --- | --- |
| `shape` | `(attr as ShapeId) \|\| 'circle'` | `setShape(newVal as ShapeId)`（仅非空） |
| `color` / `palette` | `palette ?? color ?? 'coral'` | `setPalette(newVal)`（仅非空） |
| `eye-color` | `attr ?? undefined` | `setEyeColor(newVal ?? undefined)` |
| `state` | `(attr as AvatarState) \|\| 'idle'` | `setState(newVal as AvatarState)`（仅非空） |
| `mood` | `(attr as AvatarMood \| 'auto') \|\| 'auto'` | `setMood((newVal as ...) ?? 'auto')` |
| `size` | `Number(attr) \|\| 120` | `setSize(Number(newVal) \|\| 120)`（仅非空） |
| `depth` | `hasAttribute ? Number(attr) : 6` | `setDepth(newVal === null ? 6 : Number(newVal))` |
| `clay` | `attr !== 'false'`（默认开） | `setClay(newVal !== 'false')` |
| `orbit` | `hasAttribute && attr !== 'false'`（默认关） | `setOrbit(newVal !== null && newVal !== 'false')` |
| `badge` | `(attr as BadgeKind) \|\| 'none'` | `setBadge((newVal as BadgeKind) \|\| 'none')` |
| `follow` | `attr !== 'false'`（默认开） | `setFollowPointer(newVal !== 'false')` |
| `sleep-idle` | `attr !== 'false'`（默认开，与 GrokBot 默认 false 不同） | `setSleepWhenIdle(newVal !== 'false')` |
| `reduced-motion` | `hasAttribute && attr !== 'false'`（默认关） | `setReducedMotion(newVal !== null && newVal !== 'false')` |

**Properties**：唯一公开 property 是只读 getter `instance: GrokBot | null`（`L617-L619`）；配置全部通过 attributes 或方法暴露，无自定义 setter property。

**Events**：全模块仅有一个自定义事件 `grok-poke`（`grok-bot.ts:L605`），由 `poke()` 在成功时派发，`detail: { mood: AvatarMood }`；`bubbles`/`composed` 未设置，均为默认 `false`（不冒泡、不穿透 shadow 边界）。`GrokBot.onFrame` 是回调而非 DOM 事件（`grok-bot.ts:L45`、调用点 `L212`、`L315`、`L326`）。

### 9.4 `registerGrokBot`（`grok-bot.ts:L622-L626`）

```ts
export function registerGrokBot(tagName = 'grok-bot'): void
```
在 `customElements` 存在且该标签未注册时执行 `customElements.define(tagName, GrokBotElement)`；重复调用安全。

---

## 10. 模块依赖关系与数据流

### 10.1 依赖图（`src/bot/` 内部 + `src/core/` 边界）

```
core/types.ts ──type──> ring.ts, spring.ts, scheduler.ts, shapes.ts,
                       effects.ts, grok-bot.ts
core/color.ts ─────────> palettes.ts          (oklch/parseHex/toHex/toOklch/autoEyeColor)
core/pose.ts ──────────> effects.ts           (noise)
core/path.ts ──type────> effects.ts           (Bounds)
core/fx.ts ────type────> effects.ts           (Box, Rim)

ring.ts ──> spring.ts ──> scheduler.ts ──> grok-bot.ts
   │              │              │
   ├──> core/frame.ts <──────────┴──(RenderOptions 中的 eyeRings/blinkScale/poseBlend)
   ├──> effects.ts ──────────────> core/frame.ts
   └──> clay.ts ─────────────────> core/paint.ts
shapes.ts ──> grok-bot.ts         palettes.ts ──> grok-bot.ts
core/frame.ts ──> grok-bot.ts     (computeFrame / DEFAULT_EYE_COLOR)
core/paint.ts ──> grok-bot.ts     (mountCanvas / remountCanvas / paintFrame / Surface)
core/svg.ts ────> grok-bot.ts     (renderSvg)
core/validate.ts > grok-bot.ts    (validateAvatar)
index.ts ── export * ──> 其余 8 个模块
```

具体引用点：
- `spring.ts:L11-L12` 从 core 引入 `AvatarMood`类型，从 `ring.ts` 引入 `clonePair/expressionRings/lerpPair` 与 `EyePair/Pt`。
- `scheduler.ts:L9-L10` 引入 core 类型、`SpringEyeEngine/SpringOptions`。
- `grok-bot.ts:L10-L17` 引入 `computeFrame/DEFAULT_EYE_COLOR`、`mountCanvas/paintFrame/remountCanvas/Surface`、`renderSvg`、`validateAvatar`、core 类型、`derivePalette/BotPalette`、`BotScheduler`、`findShape/SHAPES/ShapeId`。
- **注意：存在反向依赖**——`core/frame.ts:L18-L19` 反向导入 `RING_ENVELOPE/ringPath`（来自 `bot/ring.ts`）与 `badgePiece/orbitPieces`（来自 `bot/effects.ts`）；`core/paint.ts:L12` 反向导入 `applyClayToCanvas/createClayScratch/ClayScratch`（来自 `bot/clay.ts`）。即 bot 层既是上层控制器，也承载被 core 渲染层调用的纯几何/绘制工具，二者不是单向分层。
- 纯数学层（`ring/spring/scheduler/shapes/palettes/effects`）零 DOM 依赖；`clay.ts` 仅在 `createClayScratch` 中条件访问 `document`（`clay.ts:L28`）；`grok-bot.ts` 是唯一强 DOM 依赖模块（`index.ts:L4-L6` 的设计意图）。

### 10.2 眼环 → 弹簧 → 调度 → 渲染的完整数据流

1. **拓扑生成**（`ring.ts`）：`createEyeRing(RingParams)` 按固定 48 点、固定索引约定生成超椭圆并施加表情修饰；心形走 `heartRing → ringFromPolygon` 射线求交重排；`mirrorRing` 生成右眼并保持索引语义。15 种表情静态存放在 `LIBRARY`（`ring.ts:L139-L155`），`expressionRings(mood)` 返回深拷贝（`L160-L164`）。`RING_ENVELOPE`（`L186-L199`）作为所有表情的保守外包络供渲染器估算半径。
2. **弹簧插值**（`spring.ts`）：`setExpression` 把当前 `display` 深拷贝进 `source`（可中途打断），`target` 设为新表情，`springX` 归 0（`L87-L90`）。每帧 `update(dt)` 以 120Hz 子步积分二阶阻尼方程 `x'' = -k(x-1) - c·x'`（`L128-L137`），再用 `lerpPair(source, target, springX, display)` 原地写出 48×2 点（`L142`）。眨眼作为独立 `blinkScale` 正弦脉冲（`L145-L167`），视线作为独立低通 `lookCurrent`（`L169-L174`），互不污染主缓冲。`isSettled()` 汇总三路收敛状态（`L190-L195`）。
3. **状态驱动**（`scheduler.ts`）：`BotScheduler.update(dt)` 推进 `stateAge` 与两条计时器——表情轮换从 `STATE_CADENCES[state].pool` 按 `moodInterval` 随机抽取（`L197-L205`），眨眼按 `blinkInterval` 触发并按 18% 概率连眨（`L208-L213`）；`poke` 用 `burst` 覆盖当前表情 `durationSec` 后回落（`L186-L194`）；`setMood(非null)` 锁定表情暂停轮换。`reducedMotion` 下两条计时器均冻结，仅把收敛后的物理状态直传（`L184-L216`）。`nextWakeDelayMs()/advanceSleep()` 为休眠模式提供精确唤醒（`L223-L238`）。
4. **控制器串联**（`grok-bot.ts`）：`GrokBot.tick` 以 rAF 为时钟调用 `scheduler.update(dt)`，检测 mood 变化时 `beginBlend()` 抓取上一帧 `frame.pose`（`L269-L273`、`L233-L236`）；然后把 `scheduler.eyes.getRings()`、`getBlinkScale()`、调度器状态/age、视线、视角、色板等打包成 `RenderOptions`（`currentRenderOptions`，`L330-L355`）；`computeFrame`（`core/frame.ts:L427`）消费这些字段：`eyeRings` + `blinkScale` 经 `ringPath` 生成眼睛路径（`core/frame.ts:L481-L501`）、`poseBlend` 经 `blendPoses` 做 420ms 姿态缓动（`core/frame.ts:L447-L448`）、`orbitPieces`/`badgePiece` 生成外围图层（`core/frame.ts:L576`、`L588`）；`paintFrame` 把帧画到 Canvas，黏土路径由 `applyClayToCanvas` 施加（`core/paint.ts:L201-L229`）。`renderOnce` 缓存 `lastPose` 供下次过渡（`L360`）。`toSvg` 走同一 options 但强制 `reducedMotion: true`，交给 `renderSvg` 输出静态矢量图（`L472-L474`）。
5. **降帧与可见性**（`grok-bot.ts`）：`canSleep` 判定成立（且非 reducedMotion）时用 `scheduler.nextWakeDelayMs()` 设定时器，休眠期间停 rAF；唤醒先 `advanceSleep` 快进计时器再 `wake()`（`L300-L324`）。`IntersectionObserver` 在离开视口时 `pauseLoop()` 并回调 `onFrame({sleeping:true, visible:false, fps:0})`（`L202-L218`）。
6. **Web Component 桥接**（`grok-bot.ts:L519-L626`）：`<grok-bot>` 的 14 个 attributes 在 `connectedCallback` 转成 `GrokBotOptions`，后续由 `attributeChangedCallback` 转发到对应 setter；`poke()` 返回结果并派发 `grok-poke` 事件；`registerGrokBot()` 完成标签注册。

---

## 11. 导出清单速查（共 43 个具名符号）

| 模块 | 导出符号 |
| --- | --- |
| `ring.ts` | `Pt`, `EyeRing`, `EyePair`, `RingParams`, `POINT_COUNT`, `createEyeRing`, `ringFromPolygon`, `heartRing`, `mirrorRing`, `EXPRESSIONS`, `expressionRings`, `lerpPair`, `clonePair`, `ENVELOPE_N`, `RING_ENVELOPE`, `ringPath` (16) |
| `spring.ts` | `SpringOptions`, `SpringEyeEngine` (2) |
| `scheduler.ts` | `StateCadence`, `STATE_CADENCES`, `SchedulerOptions`, `BotScheduler` (4) |
| `shapes.ts` | `ShapeId`, `CanonicalShape`, `SHAPES`, `findShape` (4) |
| `palettes.ts` | `BotPalette`, `PALETTES`, `DEFAULT_PALETTE`, `findPalette`, `derivePalette` (5) |
| `effects.ts` | `OrbitPiece`, `BadgePiece`, `orbitPieces`, `badgePiece` (4) |
| `clay.ts` | `ClayScratch`, `createClayScratch`, `applyClayToCanvas`, `svgClayFilter` (4) |
| `grok-bot.ts` | `GrokBotOptions`, `GrokBot`, `GrokBotElement`, `registerGrokBot` (4) |
| `index.ts` | 上述 8 模块的 `export *`（自身无新符号） |

合计 16+2+4+4+5+4+4+4 = **43 个具名导出符号**，另加 8 条再导出语句。
