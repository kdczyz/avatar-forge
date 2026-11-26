# Image-bot 渲染核心与应用入口接口文档

> 范围：`src/core/**/*.ts`（14 个文件）与 `src/app/*.ts`（3 个文件）。
> 所有签名逐字取自源码，行号引用格式为 `文件名:L行号`（相对 `src/core/` 与 `src/app/`）。
> 标注「桶导出」表示该项也经 `src/core/index.ts` 对外重导出。

---

## 目录

1. [公共入口 index.ts](#1-公共入口-indexts)
2. [核心契约类型 types.ts（JSON 头像定义格式）](#2-核心契约类型-typestsjson-头像定义格式)
3. [逐文件公开接口](#3-逐文件公开接口)
   - [path.ts](#path_ts) · [field.ts](#field_ts) · [volume.ts](#volume_ts) · [validate.ts](#validate_ts)
   - [frame.ts](#frame_ts) · [eyes.ts](#eyes_ts) · [pose.ts](#pose_ts) · [fx.ts](#fx_ts)
   - [color.ts](#color_ts) · [svg.ts](#svg_ts) · [paint.ts](#paint_ts)
   - [app/gallery.ts](#app_gallery_ts) · [app/prompt.ts](#app_prompt_ts)
4. [渲染主流程（JSON → volume → frame → SVG / canvas）](#4-渲染主流程)
5. [validate 校验规则](#5-validate-校验规则)
6. [app 入口 main.ts 初始化流程与全局暴露](#6-app-入口-maints-初始化流程与全局暴露)

---

## 1. 公共入口 index.ts

`index.ts` 本身没有定义，全部是 re-export，是 core 的公共门面（桶文件）。完整导出清单（`index.ts:L1-49`）：

- **类型**（`index.ts:L2`）：`AvatarDefinition`、`AvatarEyes`、`AvatarMood`、`AvatarState`、`RenderOptions`、`ValidationResult` —— 来自 `types.ts`
- **值 + 类型**（`index.ts:L3-6`）：来自 `validate.ts`（`validateAvatar`、`analyzeBody`、`eyeClearance`、`gazeRange`、`EYE_W`、`EYE_H`、`GAZE_X`、`GAZE_Y`、`HAPPY_ARC`；类型 `BodyAnalysis`、`BodySubpath`、`BodyHole`、`GazeRange`）；来自 `volume.ts`（`buildVolume`、`boostedEyeScale`、`faceRoom`、`MAX_PART_DEPTH`、`EYE_BOOST`、`EYE_BOOST_PAD`、`FACE_ROOM_TARGET`；类型 `Volume`、`VolumePart`、`VolumeSlice`、`EyePlane`、`FaceRoom`）
- **帧与渲染器**（`index.ts:L7-24`）：来自 `frame.ts`（`computeFrame`、`prepare`、`avatarExtent`、`viewBasis`、`planeMatrix`、`sidePlaneMatrix`、`projectPoint`、`activeStack`、`pivotOf`、`DEFAULT_COLOR`、`DEFAULT_DEPTH`、`DEFAULT_EYE_COLOR`；类型 `Frame`、`FramePath`、`FrameShape`、`EyeMark`、`Matrix`、`ViewBasis`、`Prepared`）；来自 `svg.ts`（`renderSvg`、`placeholderSvg`）；来自 `paint.ts`（`mountCanvas`、`paintFrame`、`fitSquare`；类型 `Surface`、`Square`）
- **姿态 / 眼睛 / 颜色 / 特效 / 几何**（`index.ts:L25-49`）：来自 `pose.ts`、`eyes.ts`、`color.ts`、`fx.ts`、`path.ts`、`field.ts` 的对应导出（详见各节）。

> 注意：部分源码中 `export` 的符号**未**进入该桶，例如 `types.ts` 的 `BadgeKind`/`RingPoint`/`EyeLook`/`PoseLike`、`pose.ts` 的 `moodLook`/`isState`/`isMood`/`resolveLook`/`microAt`/`poseFromOptions`、`frame.ts` 的 `facingOf`/`mul`/`elasticityOf`/`applyElasticity`、`paint.ts` 的 `placement`/`remountCanvas`、`path.ts` 的 `isInside`/`EdgeBands`/`splitSubpaths`、`field.ts` 的 `Shape`/`edgeDistance`/`insideDistance` 等。需要这些符号时须从源文件直接导入（`main.ts` 即从 `types.ts` 直接导入 `BadgeKind`，见 `main.ts:L5`）。

---

## 2. 核心契约类型 types.ts（JSON 头像定义格式）

设计约定（`types.ts:L1-6`）：定义只描述几何 —— 一条 100×100 坐标系里的**单色轮廓路径**加一对眼睛位置；颜色、体积、视角、凝视、眨眼、动效全部由运行时决定。

### 2.1 `AvatarEyes`（`types.ts:L8-16`，桶导出）

| 字段 | 类型 | 含义 |
|---|---|---|
| `x` | `number` | 眼睛对的中心 x（viewBox 单位）`L9-10` |
| `y` | `number` | 眼睛对的中心 y `L10` |
| `spacing` | `number` | 两眼中心距（viewBox 单位）`L12-13` |
| `scale` | `number` | `1` = 单只中性眼约宽 4、高 11 `L14-15` |

### 2.2 `AvatarDefinition`（`types.ts:L18-27`，桶导出）

| 字段 | 类型 | 含义 |
|---|---|---|
| `version` | `1` | 固定字面量 `1` `L19` |
| `id` | `string` | 小写 slug，例如 `"controller"` `L20-21` |
| `name` | `string` | 展示用名称 `L22-23` |
| `body` | `{ path: string }` | 一条填充路径，nonzero 填充；孔洞反向绕行 `L24-25` |
| `eyes` | `AvatarEyes` | 眼睛位置与尺寸 `L26` |

### 2.3 状态与表情

- `AvatarState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked' | 'done' | 'alert'`（`types.ts:L29`，桶导出）—— 决定「在干什么」。
- `AvatarMood`（`types.ts:L34-49`，桶导出）—— 15 种表情：`neutral | happy | joy | love | surprised | curious | skeptical | sleepy | bored | sad | angry | focused | confused | shy | smug`。只改脸（眼睛形状、开合、闪烁、高光）加一点身体倾向；与状态正交 `L30-33`。
- `BadgeKind = 'none' | 'red' | 'blue'`（`types.ts:L51`）—— 通知角标。
- `RingPoint { x: number; y: number }`（`types.ts:L53-56`）—— 眼环顶点。

### 2.4 `RenderOptions`（`types.ts:L58-100`，桶导出）

| 字段 | 类型 | 含义（行号） |
|---|---|---|
| `color?` | `string` | 身体色 `#rgb`/`#rrggbb`，非法回落默认色（L59-60） |
| `highlightColor?` | `string` | 左上渐变高光色（L61-62） |
| `shadowColor?` | `string` | 右下内阴影色（L63-64） |
| `eyeColor?` | `string` | 眼睛色，默认近黑墨色（L65-66） |
| `size?` | `number` | 渲染尺寸 CSS px；省略为流式 SVG（L67-68） |
| `depth?` | `number` | 体积量 0..14，默认 6；0 = 全扁平（L69-70） |
| `clay?` | `boolean` | 是否叠加伪 3D 黏土质感，默认 true（L71-72） |
| `view?` | `{ yaw: number; pitch: number }` | 静止视角之上叠加的旋转（弧度）（L73-74） |
| `time?` | `number` | 动画时钟（秒）；同输入同输出（L75-76） |
| `gaze?` | `{ x: number; y: number; weight?: number }` | 注视目标，每轴 -1..1（x 右、y 下）（L77-78） |
| `state?` | `AvatarState` | 状态（L79） |
| `mood?` | `AvatarMood` | 表情（L80） |
| `stateAge?` | `number` | 状态开始后秒数；`done` 用它驱动庆祝（L81-82） |
| `reducedMotion?` | `boolean` | 冻结身体/眨眼/彩带/标记，只留凝视（L83-84） |
| `expression?` | `{ mood: AvatarMood; weight?: number }` | 额外叠加表情（权重 0..1）（L85-86） |
| `poseBlend?` | `{ from: PoseLike; t: number }` | 从上一帧 `frame.pose` 缓动，`t` 0..1（L87-91） |
| `eyeRings?` | `[RingPoint[], RingPoint[]]` | 外部弹簧引擎的 48 点闭合眼环（L92-93） |
| `blinkScale?` | `number` | 独立眨眼纵向缩放（1 睁、0.08 闭），配 `eyeRings`（L94-95） |
| `orbit?` | `boolean` | 是否显示外围轨道粒子（L96-97） |
| `badge?` | `BadgeKind` | 通知角标（L98-99） |

### 2.5 姿态相关类型

- `EyeLook`（`types.ts:L106-121`）—— 六个形状轴 + 眨眼/高光辅助量，全部数值化以便插值：`arc`（0 药丸/1 开心弧）、`slit`（细缝）、`wide`（惊讶圆度）、`star`（闪光星）、`tilt`（-1..1 倾斜）、`lid`（上眼皮下垂）、`glint`（高光），均为 `number`。
- `PoseLike`（`types.ts:L127-149`）—— 一帧姿态的全部数值，也是 `poseBlend.from` 的类型：`yaw, pitch, roll, lift, sx, sy, gazeX, gazeY, blink, squintL, squintR`（均 `number`），`eyes: EyeLook`，`ribbons, cage, sweep, bang, dots, bloom, bloomAge`（均 `number`）。`bloom` 为完成态粒子绽放强度 0..1，`bloomAge` 为粒子自身时间轴秒数 `L145-148`。
- `ValidationResult = { ok: true; value: AvatarDefinition } | { ok: false; errors: string[] }`（`types.ts:L151-153`，桶导出）。

---

## 3. 逐文件公开接口

### <a id="path_ts"></a>path.ts —— 受限 SVG 路径几何

仅接受绝对/相对 `M L H V C S Q T A Z`，解析结果由数字重新序列化，模型文本不会原样回显（`path.ts:L1-6`）。

**类型 / 常量**
- `Segment`（`path.ts:L8-14`，桶导出）—— 归一化段：`{c:'M'|'L',x,y}`、`{c:'C',x1,y1,x2,y2,x,y}`、`{c:'Q',x1,y1,x,y}`、`{c:'A',rx,ry,rot,large:0|1,sweep:0|1,x,y}`、`{c:'Z'}`。
- `Point = [number, number]`（`path.ts:L16`，桶导出）。
- `Bounds { minX, minY, maxX, maxY }`（`path.ts:L18-23`，桶导出）。
- `PATH_LIMITS = { maxChars:6000, maxSegments:400, maxSubpaths:16, coordMin:-20, coordMax:120 } as const`（`path.ts:L25-31`，桶导出）。
- `FLATNESS = 0.03`（`path.ts:L34`）—— 曲线与折线代理最大偏差。

**类**
- `class PathError extends Error {}`（`path.ts:L38`，桶导出）—— 路径解析失败异常。

**函数**

| 签名 | 行号 | 说明 |
|---|---|---|
| `parsePath(d: string): Segment[]` | `L60`（桶导出） | 解析为绝对 M/L/C/Q/A/Z；失败抛 `PathError` |
| `serializePath(segs: Segment[]): string` | `L209`（桶导出） | 由解析数字生成紧凑绝对路径 |
| `flattenPath(segs: Segment[]): Point[][]` | `L284`（桶导出） | 展平为闭合多边形，每子路径一个；过滤 <3 点 |
| `winding(polys: Point[][], x: number, y: number): number` | `L352`（桶导出） | nonzero 环绕数 |
| `isInside(polys: Point[][], x: number, y: number): boolean` | `L366` | `winding !== 0` |
| `insideRow(polys: Point[][], y: number, xs: ArrayLike<number>, out: Uint8Array): void` | `L371`（桶导出） | 一行上多点的 nonzero 内部标记 |
| `edgeBands(polys: Point[][]): EdgeBands` | `L450`（桶导出） | 边表，`WeakMap` 缓存，数组建好后不可改 |
| `bounds(polys: Point[][]): Bounds` | `L459`（桶导出） | 包围盒 |
| `filledArea(polys: Point[][], b: Bounds = bounds(polys)): number` | `L475`（桶导出） | 1 单位采样网格估算填充面积 |
| `splitSubpaths(segs: Segment[]): Segment[][]` | `L488` | 按 `M` 切分子路径 |

**类 `EdgeBands`（`path.ts:L394-445`，桶导出）** —— 同一轮廓上大量点/行测试的边表：
- `constructor(private readonly polys: Point[][])`（`L395`）
- `winding(x: number, y: number): number`（`L423`）—— 同顶层 `winding`
- `insideRow(y: number, points: ArrayLike<number>, out: Uint8Array): void`（`L431`）—— 同顶层 `insideRow`
- `insideRowAt(x: number, y: number): boolean`（`L442`）—— 单点版

### <a id="field_ts"></a>field.ts —— 标量场等值线与距离场

marching squares 把「体积高度场」变成扁平截面路径，供切片免 SVG 遮罩（`field.ts:L1-7`）。

**类型 / 常量**
- `Grid { x0, y0, step, nx, ny: number }`（`field.ts:L11-17`，桶导出）—— 规则采样网格。
- `Field extends Grid { values: Float64Array }`（`field.ts:L19-22`，桶导出）—— 行优先样本 `nx*ny`，最外圈须低于所有等值面。
- `RUN = 8`（`field.ts:L297`）—— 每行行段格子数。

**类**
- `class Shape`（`field.ts:L56-137`，桶导出）—— 轮廓边表（每边 `ax,ay,dx,dy,len`），一个定义只建一次：
  - `readonly polys: Point[][]`、`readonly bounds: Bounds`、`readonly count: number`（`L57-59`）
  - `constructor(polys: Point[][], b: Bounds = bounds(polys))`（`L62`）
  - `distance(x: number, y: number): number`（`L85`）—— 到最近边距离
  - `inside(x: number, y: number): boolean`（`L104`）
  - `signedGrid(g: Grid): Float64Array`（`L109`）—— 网格带符号距离（内部为正）
  - `widest(step = 0.6): number`（`L126`）—— 最大内切圆半径

**函数**

| 签名 | 行号 | 说明 |
|---|---|---|
| `segDist2(px, py, ax, ay, bx, by: number): number` | `L25`（桶导出） | 点到线段平方距离 |
| `edgeDistance(polys: Point[][], x: number, y: number): number` | `L36` | 到轮廓最近距离 |
| `insideDistance(polys: Point[][], x: number, y: number): number` | `L48` | 朝内距离，填充外为 0 |
| `contourLoops(field: Field, level: number, flat?: Uint8Array): Point[][]` | `L184`（桶导出） | 追踪 `值 ≥ level` 的闭合环；`flat` 预筛不穿越的行段 |
| `runRange(values: Float64Array, nx: number, ny: number): { min: Float64Array; max: Float64Array }` | `L300` | 行段 min/max，用于排除整段 |
| `simplifyLoop(loop: Point[], tolerance: number): Point[]` | `L365`（桶导出） | 闭合环 RDP 简化 |
| `loopsToPath(loops: Point[][]): string` | `L402`（桶导出） | 折线环写为紧凑闭合路径（evenodd） |
| `loopBox(loops: Point[][]): { x: number; y: number; w: number; h: number }` | `L479` | 环包围盒 |

### <a id="volume_ts"></a>volume.ts —— 扁平轮廓的隐含体积

定义始终 2D；每个填充子路径成为「部件」，带前表面高度场（背面镜像），一次切成 z 切片与 x 切片两叠普通截面路径，渲染器选更朝向观察者的一叠（`volume.ts:L1-15`）。全部纯函数并由渲染器缓存。

**类型**
- `PartKind = 'inflate' | 'revolve-x' | 'revolve-y'`（`volume.ts:L21`）。
- `VolumeSlice`（`volume.ts:L23-33`，桶导出）—— `axis:'z'|'x'`、`at:number`、`d:string`、`loops:Point[][]`、`evenOdd:boolean`、`box:{x,y,w,h}`、`inset:number`（z 切片到轮廓最小距离）。
- `VolumePart`（`volume.ts:L35-49`，桶导出）—— `kind`、`d`、`polys`、`bounds`、`center`、`thickness`、`depth`、`rxy`、`rz`、`axis?`、`zSlices:VolumeSlice[]`、`xSlices:VolumeSlice[]`、`height:(x,y)=>number`。
- `EyePlane { x, y, z, dzdx, dzdy: number }`（`volume.ts:L51-57`，桶导出）。
- `Volume`（`volume.ts:L59-67`，桶导出）—— `parts:VolumePart[]`、`bounds`、`eyePart:number`（承载眼睛的部件索引）、`eyeZ:[number,number]`、`eyeScale:number`、`eyePlanes:[EyePlane,EyePlane]`。
- `Vec3 = [number, number, number]`（`volume.ts:L69`）。
- `FaceRoom { boost, clearance: number; gaze: GazeRange; ok: boolean }`（`volume.ts:L665-670`，桶导出）。

**常量**（均桶导出）：`MAX_PART_DEPTH = 30`（`L72`，单部件最大厚度）、`EYE_BOOST = 1.45`（`L74`）、`EYE_BOOST_PAD = 3`（`L76`）、`FACE_ROOM_TARGET = 4.5`（`L78`）。

**函数**

| 签名 | 行号 | 说明 |
|---|---|---|
| `polygonEdgeDistance(polys: Point[][], x: number, y: number): number` | `L86` | 点到多边形最近边距离 |
| `insideDistance(polys: Point[][], x: number, y: number): number` | `L109` | 到轮廓向内距离，外为 0 |
| `erosionAt(part: Pick<VolumePart,'depth'\|'rxy'\|'rz'>, z: number): number` | `L114` | 深度 z 处的轮廓收缩量（椭圆圆角） |
| `insetAt(part: Pick<VolumePart,'depth'\|'rxy'\|'rz'>, level: number): number` | `L123` | `surfaceZ` 反函数 |
| `surfaceZ(part: Pick<VolumePart,'depth'\|'rxy'\|'rz'>, dist: number): number` | `L132` | 向内 `dist` 处的前表面深度 |
| `partDepth(thickness: number, b: Bounds, volume: number): number` | `L140` | 深度启发式，钳制到 `MAX_PART_DEPTH` |
| `revolveAxis(body: BodyAnalysis): number \| null` | `L218` | 判断身体是否像「侧看的车床件」，返回共享水平轴 y |
| `buildVolume(def: AvatarDefinition, volume = 1, body: BodyAnalysis = analyzeBody(def.body.path)): Volume` | `L461`（桶导出） | 构建隐含体积；`volume` 缩放所有深度，0 = 扁平 |
| `boostedEyeScale(body: BodyAnalysis, eyes: AvatarEyes): number` | `L658`（桶导出） | 不超过 `EYE_BOOST×` 且保持 `EYE_BOOST_PAD` 间隙的最大眼睛倍率 |
| `faceRoom(def: AvatarDefinition, body: BodyAnalysis = analyzeBody(def.body.path)): FaceRoom` | `L673`（桶导出） | 渲染器实际绘制时脸部余量 |

### <a id="validate_ts"></a>validate.ts —— 轮廓分析与校验

**常量**（桶导出除注明）：`EYE_W = 4`、`EYE_H = 11`（`L11-12`，scale=1 单眼宽高）；`BODY_MIN = 6`、`BODY_MAX = 94`（`L14-15`，硬限制，软要求 8..92）；`GAZE_X = 1.5`、`GAZE_Y = 1.1`（`L18-19`）；`HAPPY_ARC = { halfWidth:0.72, base:0.1, peak:0.42, stroke:0.6 } as const`（`L21`）；`EYE_CLEARANCE = 1.5`（`L23`，未入桶）。

**类型**
- `BodyHole { d: string; area: number }`（`L28-31`，桶导出）。
- `BodySubpath { d: string; polys: Point[][]; hole: boolean; probe: Point | null }`（`L33-40`，桶导出）—— `hole` 表示是挖孔；`probe` 为子路径填充内一点（孔洞则为挖空区内一点）。
- `BodyAnalysis { polys: Point[][]; bounds: Bounds; area: number; holes: BodyHole[]; subpaths: BodySubpath[] }`（`L42-48`，桶导出）。
- `GazeRange { left, right, up, down: number }`（`L50-55`，桶导出）。

**函数**

| 签名 | 行号 | 说明 |
|---|---|---|
| `eyeCenters(eyes: AvatarEyes): [Point, Point]` | `L107` | 由 x/y/spacing 得左右眼中心 |
| `eyesFit(polys, eyes, dx, dy, margin: number): Point \| null` | `L114` | 药丸外扩 margin 后是否出界（返回第一个出界点或 null） |
| `drawnEyesFit(polys, eyes, dx, dy, margin: number): Point \| null` | `L124` | 含药丸与开心弧所有可画形状 |
| `eyeClearance(polys: Point[][], eyes: AvatarEyes): number` | `L135`（桶导出） | 静止时绘制眼到轮廓最大间隙（0.1 单位，贴边 0） |
| `gazeRange(polys: Point[][], eyes: AvatarEyes): GazeRange` | `L148`（桶导出） | 各方向还能看多远（0..1 的 GAZE 比例） |
| `analyzeBody(path: string): BodyAnalysis` | `L159`（桶导出） | 解析并分析身体路径，`Map` 缓存上限 64 |
| `validateAvatar(input: unknown): ValidationResult` | `L211`（桶导出） | 校验并规范化定义，规则见 [第 5 节](#5-validate-校验规则) |

> `eyesFit`/`drawnEyesFit` 的 polys/eyes/dx/dy/margin 类型分别为 `Point[][]`、`AvatarEyes`、`number`、`number`、`number`。

### <a id="frame_ts"></a>frame.ts —— 定义 + 体积 + 姿态 → 一帧扁平数据

任何矢量渲染器都能照此绘制；正交投影（先 yaw 后 pitch），截面按深度从后往前排序（`frame.ts:L1-7`）。

**常量**：`DEFAULT_COLOR = '#ff6a1a'`（`L21`，桶导出）、`DEFAULT_EYE_COLOR = '#151515'`（`L22`，桶导出）、`DEFAULT_DEPTH = 6`（`L24`，桶导出）。

**类型**
- `Matrix = [number, number, number, number, number, number]`（`L27`，桶导出）—— 2D 仿射 `[a,b,c,d,e,f]`。
- `EyeMark`（`L29-32`，桶导出）—— `{shape:'pill',x,y,width,height,radius}` / `{shape:'arc',d:string,strokeWidth:number}` / `{shape:'path',d:string}`。
- `FramePath { id, d: string; evenOdd: boolean; box: Box }`（`L34-39`，桶导出）。
- `FrameShape`（`L41-54`，桶导出）—— 联合类型：`{kind:'slice',key,path,matrix}`、`{kind:'eye',key:'eye-0'|'eye-1',matrix,mark}`、`{kind:'ribbon',key,d,box,matrix,front,gradient:{x1,y1,x2,y2,stops:string[]}}`、`{kind:'mark',key,id,d,box,matrix}`、`{kind:'particle',key,d,box,matrix,fill,front}`。
- `Frame`（`L56-71`，桶导出）—— `name,color,highlight,shadow:string`、`clay:boolean`、`bodyBox:Bounds`、`ink:string`、`paths:FramePath[]`、`root:Matrix`（整体 2D 动作）、`shapes:FrameShape[]`（从后往前）、`pose:PoseLike`（可直接作为下一帧 `poseBlend.from`）。
- `ViewBasis { cY, sY, cP, sP, facing: number }`（`L76-83`，桶导出）—— `facing = cos(yaw)·cos(pitch)`，>0 正面朝向观察者。
- `Prepared { def, body, vol, range, seed, id, ids, rim }`（`L202-211`，桶导出）—— 缓存的校验定义 + 体积：`def:AvatarDefinition`、`body:BodyAnalysis`、`vol:Volume`、`range:GazeRange`、`seed:number`、`id:string`、`ids:Map<string,string>`、`rim:()=>Rim`。

**函数**

| 签名 | 行号 | 说明 |
|---|---|---|
| `viewBasis(yaw: number, pitch: number): ViewBasis` | `L85`（桶导出） | 视图基 |
| `facingOf(v: ViewBasis, [x, y, z]: [number, number, number]): number` | `L92` | 模型方向朝向观察者的分量 |
| `mul(m: Matrix, n: Matrix): Matrix` | `L96` | 仿射矩阵相乘 |
| `pivotOf(b: Bounds): Point` | `L111`（桶导出） | 包围盒中心 |
| `planeMatrix(v: ViewBasis, z: number, pivot: Point): Matrix` | `L114`（桶导出） | 深度 z 平面投影 |
| `sidePlaneMatrix(v: ViewBasis, x0: number, pivot: Point): Matrix` | `L127`（桶导出） | 侧平面 x=x0 投影（局部 u=-z） |
| `projectPoint(v: ViewBasis, [x, y, z]: [number,number,number], pivot: Point): [number, number, number]` | `L132`（桶导出） | 点投影（含深度） |
| `activeStack(v: ViewBasis): 'z' \| 'x'` | `L140`（桶导出） | 选更朝向观察者的截面叠 |
| `elasticityOf(b: Bounds): number` | `L169` | 圆形度 → 弹性系数 |
| `applyElasticity(pose: Pose, k: number): Pose` | `L177` | 按弹性系数放大形变 |
| `prepare(definition: AvatarDefinition, depth?: number): Prepared` | `L216`（桶导出） | 校验 + 缓存体积/ID/rim；非法定义抛错 |
| `computeFrame(definition: AvatarDefinition, options: RenderOptions = {}, size?: number): Frame` | `L427`（桶导出） | 计算一帧；定义非法抛错；`size` 用于剔除过密截面 |
| `avatarExtent(definition: AvatarDefinition, depth?: number): { x: number; y: number; size: number }` | `L646`（桶导出） | 一帧可用方形范围，canvas 位图上限 |

### <a id="eyes_ts"></a>eyes.ts —— 任意 look 下单眼轮廓

药丸/开心弧/细缝/闪光星/闭眼线全部采 40 点逐点混合，tilt 最后统一旋转（`eyes.ts:L1-7`）。

- `EyeSpot { x, y, w, h, open, shift: number; closed?: boolean }`（`eyes.ts:L13-24`，桶导出）—— 单眼画在哪；`open`/`shift` 为眨眼后高度与下移量；`closed` 完全闭眼。
- `plainLook(look: EyeLook): 'pill' | 'arc' | null`（`L196`，桶导出）—— 恰好药丸/开心弧时返回简单图元。
- `eyeOutline(look: EyeLook, e: EyeSpot): Point[]`（`L231`，桶导出）—— 混合后的 40 点闭合轮廓（顺时针）。
- `outlinePath(pts: Point[]): string`（`L267`，桶导出）—— 光滑闭合路径（绝对 M/Q/Z）。
- `eyePath(look: EyeLook, e: EyeSpot): string`（`L284`，桶导出）—— `outlinePath(eyeOutline(...))`。
- `glintPath(e: EyeSpot, strength: number): { d: string; r: number; x: number; y: number } | null`（`L289`，桶导出）—— 高光圆。

### <a id="pose_ts"></a>pose.ts —— 确定性姿态模型

姿态是 `(seed,time,state,mood,gaze,reducedMotion)` 纯函数，无墙上时钟、无 `Math.random`（`pose.ts:L1-8`）。

**类型 / 常量**
- `EyeLook` 从 `types.ts` 重导出（`pose.ts:L11`）；`Pose = PoseLike`（`pose.ts:L44`，桶导出）。
- `PoseInput { seed: number; time: number; state?: AvatarState; mood?: AvatarMood; expression?: {mood,weight?}; stateAge?: number; gaze?: {x,y,weight?}; reducedMotion: boolean; view?: {yaw,pitch} }`（`pose.ts:L179-190`，桶导出）。
- `STATES: readonly AvatarState[]`（`L46`，桶导出）、`MOODS: readonly AvatarMood[]`（`L47`，桶导出）。
- `BASE_YAW = -0.3`、`BASE_PITCH = 0.2`（`L82-83`，桶导出）；`LOOK_YAW = 0.32`、`LOOK_PITCH = 0.18`、`LOOK_EYES = 0.7`（`L85-87`，未入桶）。
- `DONE_TURN_S = 3.87`、`DONE_CYCLE_S = 6.2`（`L231-232`，桶导出）。

**函数**

| 签名 | 行号 | 说明 |
|---|---|---|
| `moodLook(mood: AvatarMood): EyeLook` | `L40` | 表情 → 眼睛配方（15 种） |
| `isState(value: unknown): value is AvatarState` | `L65` | 状态守卫 |
| `isMood(value: unknown): value is AvatarMood` | `L69` | 表情守卫 |
| `resolveLook(given: { state?: unknown; mood?: unknown }): { state: AvatarState; mood: AvatarMood }` | `L73` | 归一化状态/表情，`grumpy`→`angry` |
| `hashString(s: string): number` | `L91`（桶导出） | FNV-1a 32 位 hash |
| `noise(seed: number, n: number): number` | `L101`（桶导出） | 无状态 hash 噪声 [0,1) |
| `blinkAt(seed: number, t: number, rhythm: { slot?: number; dur?: number; double?: number } = {}): number` | `L120`（桶导出） | 眨眼闭合 0..1 |
| `wanderAt(seed: number, t: number, reach = 1): [number, number]` | `L138`（桶导出） | 空闲视线游走 |
| `microAt(seed: number, t: number): { mood: AvatarMood; weight: number } \| null` | `L166` | 偶发微表情 |
| `blendPoses(a: Pose, b: Pose, t: number): Pose` | `L193`（桶导出） | 姿态插值（`bloomAge` 不插值） |
| `computePose(input: PoseInput): Pose` | `L319`（桶导出） | 核心姿态计算（状态机 + 表情 + 凝视） |
| `poseFromOptions(seed: number, options: RenderOptions): Pose` | `L569` | 从 `RenderOptions` 取姿态相关字段 |

### <a id="fx_ts"></a>fx.ts —— 身体外的彩带、粒子与标记

**类型**
- `Box { x, y, w, h: number }`（`fx.ts:L20-25`，桶导出）。
- `Rim { cx, cy: number; at: (angle:number)=>number; max: number }`（`L34-39`，桶导出）—— 身体各方向到中心的最远距离。
- `RibbonPiece`（`L70-78`，桶导出）—— `d`、`front:boolean`、`box:Box`、`ribbon:number`、`gradient:{x1,y1,x2,y2,stops:string[]}`。
- `BloomPiece { d: string; box: Box; matrix: [number×6]; fill: string; front: boolean }`（`L189-195`，桶导出）。
- `MarkPart { shape, d: string; box: Box; x, y, turn, scale: number }`（`L297-305`，桶导出）。

**函数**

| 签名 | 行号 | 说明 |
|---|---|---|
| `rimOf(polys: Point[][], cx: number, cy: number): Rim` | `L41`（桶导出） | 构建彩带环的 Rim |
| `ribbonPieces(rim: Rim, presence: number, seed: number, time: number, sweep: number, cage: number, inside: (x:number,y:number)=>boolean, runOf: (ribbon:number)=>string[]): RibbonPiece[]` | `L98`（桶导出） | 当前所有可见彩带片段 |
| `bloomPieces(b: Bounds, seed: number, age: number, energy: number, palette: string[]): BloomPiece[]` | `L207`（桶导出） | 完成态粒子绽放（纯函数） |
| `tube(points: Point[], width: number, closed = false): string` | `L272` | 折线扩成「粗线」闭合路径 |
| `markParts(b: Bounds, bang: number, dots: number, seed: number, time: number, still: boolean): MarkPart[]` | `L323`（桶导出） | 感叹号/三圆点标记部件 |
| `bodyScale(bang: number, dots: number): number` | `L373`（桶导出） | 标记让位后身体保留尺寸 |

### <a id="color_ts"></a>color.ts —— 极简颜色处理

仅接受 `#rgb`/`#rrggbb`；彩带用 OKLCH（`color.ts:L1`）。

- `Rgb = [number, number, number]`（`color.ts:L3`，桶导出）。
- `parseHex(input: unknown): Rgb | null`（`L5`，桶导出）。
- `toHex([r, g, b]: Rgb): string`（`L14`，桶导出）。
- `mix(a: Rgb, b: Rgb, t: number): Rgb`（`L19`）。
- `luminance([r, g, b]: Rgb): number`（`L24`）—— WCAG 相对亮度。
- `contrast(a: Rgb, b: Rgb): number`（`L32`，桶导出）。
- `DARK_INK: Rgb = [20,22,34]`（`L38`）、`LIGHT_INK: Rgb = [250,250,255]`（`L39`）。
- `autoEyeColor(body: Rgb): Rgb`（`L42`，桶导出）—— 自动挑对比度更好的墨色。
- `toOklch(c: Rgb): [number, number, number]`（`L53`，桶导出）—— 亮度 0..1、彩度、色相（度）。
- `oklch(L: number, C: number, h: number): Rgb`（`L79`，桶导出）—— sRGB，超色域按最小必要降彩度。

### <a id="svg_ts"></a>svg.ts —— 静帧 SVG 渲染器

- `renderSvg(definition: AvatarDefinition, options: RenderOptions = {}): string`（`svg.ts:L36`，桶导出）—— 渲染为独立 SVG 字符串；内部调用 `computeFrame`；定义非法抛错；`options.size` 钳制到 8..4096（`L77`）。
- `placeholderSvg(definition: AvatarDefinition, size = 64): string`（`L91`，桶导出）—— 未算体积的轻量占位（缩略图首屏）。

### <a id="paint_ts"></a>paint.ts —— canvas 渲染器

一头像位图只覆盖实际绘制范围，随尺寸/像素比重建（`paint.ts:L1-7`）。

- `FIT_SLACK = 8`（`L15`）、`FIT_PAD = 1`（`L17`）—— 布局余量常量。
- `Square { x, y, size: number }`（`L19-23`，桶导出）。
- `Bounds2 { x0, y0, x1, y1: number }`（`L25-30`）。
- `Surface { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null; cap: Square; fit: Square | null; layout: string; left, top: number; clay: ClayScratch | null }`（`L133-142`，桶导出）。

**函数**

| 签名 | 行号 | 说明 |
|---|---|---|
| `placement(frame: Frame): { matrices: Matrix[]; bounds: Bounds2; sliceBounds: Bounds2 }` | `L42` | 每帧变换与绘制范围 |
| `fitSquare(prev: Square \| null, b: Bounds2, cap: Square): Square` | `L112`（桶导出） | 复用/扩张方形布局，不超 cap |
| `mountCanvas(canvas: HTMLCanvasElement, definition: AvatarDefinition, depth?: number): Surface` | `L144`（桶导出） | 初始化 Surface（含 `avatarExtent`） |
| `remountCanvas(surface: Surface, definition: AvatarDefinition, depth?: number): Surface` | `L159` | 换形象/深度复用 Surface |
| `paintFrame(surface: Surface, frame: Frame, size: number): void` | `L173`（桶导出） | 画一帧（CSS px），处理黏土/截面/眼睛/彩带/粒子 |

### <a id="app_gallery_ts"></a>app/gallery.ts

- `GALLERY: AvatarDefinition[]`（`gallery.ts:L7-12`）—— `import.meta.glob('../../gallery/*.json', { eager:true, import:'default' })`（`L5`）按路径排序后逐条 `validateAvatar`，仅保留 `ok` 项。
- `findDefinition(id: string): AvatarDefinition | undefined`（`L14-16`）—— 按 id 查 GALLERY。

### <a id="app_prompt_ts"></a>app/prompt.ts

- `DESIGN_PROMPT: string`（`prompt.ts:L5-37`）—— 复制给聊天模型的设计提示词，描述契约本身：100×100 单色路径 + 一对眼睛位置，含规则与 2 个示例（box/egg）。

---

## 4. 渲染主流程

主链路：**JSON 定义 → validate → analyzeBody → buildVolume → prepare → computeFrame → renderSvg / paintFrame**。

1. **校验与规范化**：`validateAvatar(definition)`（`validate.ts:L211`）返回规范化 `AvatarDefinition`（路径经 `parsePath`→`serializePath` 重写）或错误。
2. **轮廓分析**：`analyzeBody(path)`（`validate.ts:L159`）解析/展平为 `BodyAnalysis`（polys、bounds、area、subpaths、holes），`Map` 缓存。
3. **体积推断**：`buildVolume(def, depth/DEFAULT_DEPTH, body)`（`volume.ts:L461`）把每个 outline 变为 `VolumePart`（`inflate`/`revolve-x`/`revolve-y`），采样高度场并切出 `zSlices`/`xSlices`，计算 `eyePart`/`eyeZ`/`eyeScale`/`eyePlanes`。
   - 调用点：`prepare()`（`frame.ts:L224`）用 `clampedDepth(depth)/DEFAULT_DEPTH`，`clampedDepth` 把 depth 钳到 0..14、按 0.5 取整（`frame.ts:L194-197`）。
4. **预计算缓存**：`prepare(definition, depth?)`（`frame.ts:L216`）串联上述 3 步，并生成 `ids`（路径 → 稳定 ID，`L226-229`）、`id` 前缀、`seed`、`range = gazeRange(...)`、`rim()` 懒加载（`L231-243`），缓存上限 48。
5. **姿态与视角**：`computeFrame`（`frame.ts:L427`）先 `computePose(...)`（`L435`）→ `applyElasticity(...)`（`L445`）→ 可选 `blendPoses(from, pose, smoothstep(t))`（`L447-449`）→ `viewBasis(yaw,pitch)`（`L450`）→ `activeStack(v)`（`L451`）。
6. **截面投影与排序**：遍历各 part 的 `zSlices`/`xSlices`，`sliceCull` + `keptSlices` 剔除（`L402-424`、`L467-479`），按深度 `items.sort`（`L526`）。眼睛走 `eyeRings` 分支（`ringPath`，`L481-506`）或常规 `eyeMark` 分支（`L507-525`）。
7. **附加图元**：彩带 `ribbonPieces`（`L532-558`）、粒子 `bloomPieces`（`L560-573`）、轨道 `orbitPieces`（`L574-587`）、角标 `badgePiece`（`L588-614`）、标记 `markParts`（`L617-631`）；按前后顺序合成 `ordered`（`L633-640`），得到 `Frame`。
8. **输出**：
   - SVG：`renderSvg(def, options)`（`svg.ts:L36`）调用 `computeFrame`，把 `Frame` 序列化为 `<svg>`（切片分组套黏土滤镜、路径 `<defs>`、渐变、矩阵变换）。
   - Canvas：`mountCanvas` 建 `Surface`（`paint.ts:L144`）→ `computeFrame` → `paintFrame(surface, frame, size)`（`paint.ts:L173`）用 `Path2D` + `fill`/`drawImage` 绘制，`avatarExtent` 决定位图上限。
   - 轻量占位：`placeholderSvg`（`svg.ts:L91`）。

> `computePose` 通过 `bot/ring.ts`、`bot/palettes.ts`、`bot/effects.ts` 取眼环/调色/角标几何（`frame.ts:L17-19`），这些属于 bot 层、不在本文档范围。

---

## 5. validate 校验规则

`validateAvatar(input: unknown): ValidationResult`（`validate.ts:L211-296`）按顺序执行，遇错累积到 `errors`，最终返回 `{ok:false,errors}` 或规范化 `{ok:true,value}`：

1. **根类型**（`L213`）：必须是非数组对象，否则 `definition must be a JSON object`。
2. **顶层白名单**（`L215`）：只允许 `version,id,name,body,eyes`（`TOP_KEYS`，`L25`），多余字段报错。
3. **version**（`L216`）：必须严格等于 `1`。
4. **id**（`L218-221`）：字符串且匹配 `/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/`（1–40 位小写 slug）。
5. **name**（`L222-225`）：`trim()` 后 1–40 字符，且不含 `\u0000-\u001f` 与 `<`/`>`。
6. **body**（`L227-233`）：必须是对象；仅允许 `path` 字段（`L230`）；`path` 必须是字符串。
7. **eyes**（`L235-250`）：必须是对象；仅允许 `x,y,spacing,scale`（`EYE_KEYS`，`L26`）；四字段必须有限数；`scale ∈ [0.6,1.8]`（`L244`）；`spacing ∈ [EYE_W*scale*1.75, 40]`（`L245-248`）。
8. **路径解析**（`L252-263`）：`parsePath(path)` → `serializePath(segs)`（得到规范化 `normalized`）→ `analyzeBody(normalized)`；`PathError` 转为 `body.path: ...` 错误，其他异常继续抛出。
9. **安全区**（`L265-272`）：body 包围盒四边须在 `BODY_MIN=6`..`BODY_MAX=94` 内，否则提示保持 8..92（软要求）。
10. **尺寸**（`L273-277`）：长边 ≥ 40 且短边 ≥ 14。
11. **填充面积**（`L278`）：`body.area ≥ 600`。
12. **眼睛可放性**（`L280-287`）：`eyesFit(body.polys, eyes, 0, 0, EYE_MARGIN=1.2)` 必须返回 `null`（眼睛含 margin 完全在实体内、不在孔洞）。
13. **结果**（`L291-295`）：无错误且 eyes 有效时返回规范化定义（name 已 trim、path 已重写、eyes 重建）。

关联判定规则：`analyzeBody` 中子路径「孔洞」判定为 `inside>0 && cut/inside > 0.6`（`validate.ts:L199-201`）；`gazeRange` 每方向按 `1,0.8,0.6,0.4,0.2` 递减试探，保持 `EYE_CLEARANCE`（`L148-156`）；`faceRoom.ok` 要求 `boost≥EYE_BOOST`、`clearance≥FACE_ROOM_TARGET` 且四向 gaze 均为 1（`volume.ts:L679`）。

---

## 6. app 入口 main.ts 初始化流程与全局暴露

`main.ts` 是工作台页面入口，**本身没有任何 `export`，也不向 `window` 挂载自定义属性**（源码无 `window.xxx =` 赋值；对 `window` 仅作读取：`innerWidth`/`innerHeight`/`matchMedia`，见 `main.ts:L86-89,L98,L106,L235`）。它对全局环境的唯一"暴露"是通过 `registerGrokBot()`（`main.ts:L13`）把 `<grok-bot>` 自定义元素注册到浏览器 `customElements` 注册表（`bot/grok-bot.ts:L622-625`），从而让页面/嵌入代码可用该标签。

**初始化顺序**（`main.ts`）：

1. 导入样式与依赖（`L2-11`）：`renderSvg`、`validateAvatar`、契约类型、`EXPRESSIONS`、`PALETTES`/`derivePalette`、`SHAPES`、`GrokBot`/`registerGrokBot`、`GALLERY`、`DESIGN_PROMPT`。
2. **注册自定义元素**：`registerGrokBot()`（`L13`）→ `customElements.define('grok-bot', GrokBotElement)`（`bot/grok-bot.ts:L622-625`）。`GrokBotElement`（`bot/grok-bot.ts:L519-620`）公开：`connectedCallback`/`disconnectedCallback`/`attributeChangedCallback`、`poke(mood?)`、`setDefinition(def)`、`toSvg(px=512)`、`get instance()`；观察属性见 `observedAttributes`（`L520`，含 shape/palette/color/state/mood/size/depth/clay/orbit/badge/follow/sleep-idle/reduced-motion 等，映射在 `L557-600`）。
3. **静态配置表**：`STATES`（7 状态，`L15-23`）、`MOOD_LABELS`（15 表情中文名，`L25-41`）、`BADGES`（`L43-47`）、`YOURS_KEY='avatar-forge:yours'`（`L49`）。
4. **本地存储恢复**：`loadYours()`（`L57-68`）从 `localStorage[YOURS_KEY]` 读取数组并逐条 `validateAvatar` 过滤；`saveYours()`（`L70-76`）写回。
5. **初始状态变量**（`L81-98`）：`yours`、`current=SHAPES[0].definition`、`currentPaletteId`、`customColor`、`depth=6`、响应式 `size`（窄屏/宽屏两套公式，`L86-90`）、`state='idle'`、`moodMode='auto'`、`clay=true`、`orbit=false`、`badge='none'`、`follow=true`、`sleepIdle=false`、`reduce` 取 `prefers-reduced-motion`。
6. **关键 DOM 抓取**：`must()`（`L51-55`）取 `#stage`、`#runtime-mood`、`#fps`、`#embed-preview`（`L100-103`）；`resizeStage()` 设置舞台最小高度并立即调用（`L105-110`）。
7. **创建引擎实例**：`new GrokBot({...})`（`L112-133`），传入 container/definition/palette/size/depth/clay/state/mood/orbit/badge/followPointer/sleepWhenIdle/reducedMotion，以及 `onFrame` 回调更新表情标签与 fps（`L126-132`）；设置 `bot.wrapper.style.cursor='grab'`（`L135`）。
8. **图库与缩略图**：`renderThumbList`/`buildGallery`（`L149-169`）合并 `SHAPES + GALLERY + yours`；`markCurrent`（`L171-175`）；`upgradeThumbnails()`（`L177-203`）用 `requestIdleCallback`（回退 `setTimeout`）逐个 `renderSvg` 生成 96px 缩略图；`paletteFor`（`L143-147`）按 id hash 选色板。
9. **元信息与嵌入预览**：`updateMeta()`（`L205-209`）、`updateEmbedPreview()`（`L211-220`）生成 `<grok-bot ...>` 标签文本；`select(def)`（`L222-238`）切换形象并同步 bot/色板/视角/图库。
10. **控件绑定**：状态 `syncPills`（`L243-261`）、表情 `syncMood`（`L263-294`）、角标 `syncBadges`（`L296-313`），以及 `#poke`、`#clay`、`#orbit`、`#follow`、`#sleep-idle`、`#reduce`、`#color`、`#swatches`/`syncSwatches`、`#depth`、`#size` 的事件监听（`L315-401`）。
11. **导入/导出**：`#import-add` 逐条 `validateAvatar` 后合并去重、持久化、刷新图库（`L415-444`）；`#import-export` 序列化当前定义（`L446-450`）；`download`（`L452-459`）；SVG/PNG 下载（`L461-481`）；`copyText`（`L483-497`）与 `#copy-prompt`/`#copy-embed`（`L499-500`）。
12. **启动调用**（`L505-511`）：依次 `updateMeta()`、`syncSwatches()`、`syncPills()`、`syncMood()`、`syncBadges()`、`buildGallery()`、`upgradeThumbnails()`。

**全局暴露小结**：`main.ts` 不写 `window` 属性；实际暴露给宿主页面的是由 `registerGrokBot()` 注册的 `<grok-bot>` 自定义元素（全局 `customElements` 注册表），其公开 API 见 `GrokBotElement`（`bot/grok-bot.ts:L519-620`）。`src/app/gallery.ts` 的 `GALLERY`/`findDefinition` 与 `src/app/prompt.ts` 的 `DESIGN_PROMPT` 均为模块级导出，供 `main.ts` 等 ES 模块导入，不挂全局。
