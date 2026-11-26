# 逆向分析报告：open-bot-avatar → Avatar Forge

分析对象：`/home/ubuntu/Desktop/open-bot-avatar`（`https://github.com/DominikScholz/open-bot-avatar`，HEAD `323ce6a`）
分析方式：完整源码仓库 + 仓库内测试与文档 + 在本机浏览器里对复刻实现的像素级探针。
产出：本工作区的独立复刻实现（`Avatar Forge`）。

---

## 0. 方法说明（REA 路由）

目标是一个**完整的源码仓库**（141 个受版本控制的文件、约 9200 行 TS/TSX）。按 REA 的路由规则，这种情况属于
"ordinary source-repository architecture analysis"，走仓库工具即可，不需要 `open_binary` / Ghidra / JADX 之类的
原生引擎，也不存在需要对比的 shipped artifact。因此本次没有引入二进制分析，也没有宣称任何"运行时可观测"
证据；所有结论都来自源码、仓库内测试和我在复刻实现上做的实机探针（见 §8）。

## 1. 产品形态

原项目不是"一堆头像图片"，而是一套**几何契约 + 推断式渲染器 + 编辑器**：

| 层 | 内容 | 位置 |
| --- | --- | --- |
| 契约 | `{version,id,name,body.path,eyes}`，100×100 viewBox，一条单色路径 + 一对眼睛 | `docs/avatar-contract.md` |
| 渲染器 | 纯函数：JSON → 帧数据 → canvas / SVG / CSS 3D 场景 | `packages/core/src/render.ts` |
| 编辑器 | 图库、调色、状态/情绪、导入导出、生成提示词 | `apps/site/src/Studio.tsx` |
| 生成侧 | system prompt + skill，让模型产出符合契约的 JSON | `skills/generate-avatar/` |
| 图库 | 19 个头像定义 | `gallery/*.json` |

关键产品判断：**定义里只有几何**。颜色、体积、视角、凝视、眨眼、动效全部属于运行时，所以同一份 JSON 能被
任意宿主（网页、聊天产品、agent 面板）以不同颜色和状态渲染，而不需要重新生成素材。

## 2. 架构分层

```
apps/site            Vite + React 的编辑器与文档站（studio/* 里是面板、缩略图、分享链接）
packages/core
  types.ts           契约与渲染选项
  path.ts            受限 SVG 路径解析 / 序列化 / 展平 / nonzero 绕数 / 边带索引
  distance.ts        最近边查询（分桶 + 瓦片递归 + 批量裁剪）
  contour.ts         marching squares、RDP 简化、环 → 紧凑路径
  volume.ts          体积推断（inflate / revolve-x / revolve-y）、截面生成、眼窝与眼平面
  validate.ts        契约校验、子路径/孔洞判定、眼睛可放性、凝视范围
  render.ts          视图矩阵、帧装配（切片排序、眼睛、彩带、标记）、SVG 与场景序列化
  motion.ts          确定性姿态模型（空闲/思考/工作/等待/阻塞/完成 + 情绪）
  mood.ts follow.ts animator.ts   状态切换缓动、指针跟随、每帧步进
  eyes.ts            药丸/开心弧/细缝的逐点形变
  effects.ts         彩带几何（hoop/lane/gradient）与标记（三点、感叹号）
  color.ts           hex + OKLCH 色阶
  dom/               canvas 渲染器（paint.ts）、挂载（mount.ts）、时钟、指针、fluffy/WebGL 材质
```

依赖方向是单向的：`path → contour/distance → volume → validate/render → dom`。`volume.ts` 只依赖纯几何，
所以同一套体积数据既喂 canvas、又喂 SVG、又喂 CSS 3D 场景。

## 3. 核心算法（逐条）

### 3.1 路径：只接受可枚举的命令

`path.ts` 白名单 `M L H V C S Q T A Z`（含相对形式），把 `S/T` 展开成 `C/Q`，弧转成参数化采样，然后
**从数字重新序列化**——模型写的文本永远不会被原样拼进标记。限制：6000 字符、400 段、16 子路径、坐标 −20..120。
曲线展平用 Wang 上界（`n ≈ sqrt(0.75·m/FLATNESS)`），`FLATNESS = 0.02`（我复刻取 0.03，肉眼无差、速度更快）。

### 3.2 距离：为什么需要索引

绘制时的"向内距离"要 millions 级别查询：体积采样网格、切线厚度、眼睛净空、眼平面斜率。原实现有两条路：
`EdgeBands`（按 y 分带的边表，用于绕数/整行内部判定）与 `EdgeIndex`（4 单位分桶 + 16×16 采样瓦片 + 递归裁剪，
用于最近距离）。`distance.ts` 的注释明确写了"最小值与遍历顺序无关，所以可以证明安全地跳过边"——这是个
性能实现，而不是算法近似。

我的复刻保留了语义、简化了实现：`EdgeBands` 用一遍整数算术做绕数/行扫描（相同答案，代码 60 行），
距离用暴力遍历（一个定义几百万次内积，几十毫秒，且结果被缓存）。复刻的取舍写在 README。

### 3.3 体积推断：高度场

每个填充子路径成为"部件"，被分到三类之一（`volume.ts`）：

- `revolve-x`：整身共享一条水平轴对称（零件数 ≥2、宽 > 1.1×高、每个部件中线都在轴上、上下镜像差 <2%），
  例如哑铃：杆成圆柱、配重成圆片。
- `revolve-y`：多部件身体里，某部件每行扫描线只交一段且中点都落在自身竖直中心（杯身、灯泡）。
- `inflate`：其余情况，圆角板。

前三者的深度：

```
inflate:  thickness = 2 × max(向内距离)            // 内切圆直径
          depth     = clamp(0.8 × max(thickness, min(0.4×长边, 2.4×thickness)), 3, 30) × volume
          rxy = min(thickness/2, depth/2) × 0.9 ; rz = depth/2 × 0.85
revolve:  thickness = 2 × max(半径) ; depth = 2 × 半径 × volume
```

前表面高度 `h(x,y)`：

- inflate：`surfaceZ(dist)` —— 直壁段 + 椭圆圆角段（`half − rz + rz·√(1−k²)`）。
- revolve：`v × √(r(轴坐标)² − t²)`，`t` 是到轴的垂直距离。

这个高度场是后续一切的基础：它对"平的一张图"补出了第三条轴。

### 3.4 截面：把一个高度场切成两叠普通路径

渲染的不是 3D 网格，而是**一堆 2D 截面路径**，这样任何矢量后端都能画，不需要遮罩、Z-buffer 或 shader。

- **z 切片**（朝向观察者的平面）：高度场的等值面。inflate 的等值面等价于"到轮廓距离 = insetAt(level)"，
  所以直接在带符号距离场上取等值线；revolve 用 `(r² − t² − (level/v)²) / 2r` 作为近似距离场。
  等值线 = marching squares（含对角歧义的均值消歧）+ 环追踪 + RDP + 二次曲线平滑（`loopsToPath`）。
  核心截面直接复用原始 nonzero 轮廓（含孔洞）。
  层级不是等距，而是按圆角段的角度均分（`levels()`）：圆角处变化快，直壁处一刀。
  细长而深的鳍（气泡尾巴、耳朵）再补 `FINE_Z = 0.6` 的细分切片，裁剪到局部框，避免"斜看时散成多片"。
- **x 切片**（朝向侧面的平面）：每几个网格列取一个平面，坐标是 `(u = −z, y)`，每行取 slab 内的最大高度，
  于是侧看时叠加起来正好是实体的侧影。左右镜像成对称环。

渲染时按视角选择更朝向观察者的那叠（`activeStack`：`|cos yaw| ≥ |sin yaw|` 用 z 叠，否则 x 叠），
被核心挡住的 z 切片直接剔除（`sliceCull`），小尺寸下再按 ~0.75px 间隔抽稀（`sliceDetail`）。

### 3.5 投影与排序

正交投影，先绕竖直轴 yaw、再绕水平轴 pitch：

```
planeMatrix(z) = [ cY, sY·sP, 0, cP,  cx − cY·cx + sY·z,
                   cy − cP·cy − sY·sP·cx − cY·sP·z ]
sidePlaneMatrix(x0) = [ −sY, cY·sP, 0, cP, cx + cY·(x0−cx), cy − cP·cy + sY·sP·(x0−cx) ]
```

同叠的平行截面在每条视射线上顺序相同，所以深度就是 `facing · at`（z 叠）或 `−sY·cP·at`（x 叠），
排序后从后往前画。眼睛不是切片，而是"贴在表面上的一个平面"：用高度场有限差分得到切平面斜率，
`eyeMatrix` 在平面矩阵上补 `sY·dzdx` 等项，并按注视偏移量参与深度排序。

### 3.6 眼睛

契约：scale 1 时 4×11 药丸，`spacing` 中心距。渲染器最多放大到 `EYE_BOOST = 1.45`：
从 1.45 往下试，取第一个"绘制眼睛（药丸 + 开心弧）与轮廓保持 `EYE_BOOST_PAD = 3` 净空"的倍率。
`gazeRange` 用同样的贴合测试，按 1 / 0.8 / 0.6 / 0.4 / 0.2 五档找每个方向还能走多远（保持 1.5 净空），
于是窄脸会自动减小放大与行程，而不是把眼睛顶出去。

形状：药丸、开心弧、等待时的细缝，各自**从顶部中心顺时针等距采样 40 点**，按 `arc` / `slit` 权重逐点混，
输出一条闭合路径 → 状态切换时眼睛是形变，不是换图。

### 3.7 姿态：确定性

`computePose(seed,time,state,mood,gaze,reducedMotion,view)` 是纯函数，没有 `Date.now` / `Math.random`。
`noise(seed,n)` 是无状态 hash，用来给每个头像错开相位（多个头像不会齐步走）。
节拍：空闲呼吸 3.4s、眨眼槽 4.2s（偶尔连眨）、视线游走 1.9s 槽；工作每 7.5s 来一圈彩带（弹簧缓入
`1−(1+e)e^{−e}`），完成时按 `celebration(t)` 曲线在 3.79s 内走完整 9 圈，身体只转三分之一。
状态/情绪切换由 `mood.ts` 的 smoothstep 420ms 与 `blendPoses` 插值，切换中的切换会冻结在当前进度继续。

### 3.8 效果

彩带：环半径 = 轮廓在该方向上的支撑距离 + 边距；倾角 0.386 rad，滚转 0.157 rad，每圈 3–5 条带，
相邻半径差 38 设计单位（设计空间 228.541 → 身体 80 单位）。每条带按 `sweep` 的份额 + 自身漂移前进，
尾部短于头部，颜色沿身体 OKLCH 色阶走（更亮更暖 / 更暗更冷），片段按"在身体前 / 在身体后且在剪影外"
切成可见段，再按前后分两批插入绘制顺序。标记：感叹号（胶囊 + 圆点，2.6s 跳一次）与三个圆点（轮流跳）。

### 3.9 渲染后端

- **canvas**（默认，`dom/paint.ts`）：每帧把扁平帧画到一张 canvas；位图只覆盖实际绘制范围 + 余量，
  尺寸/DPR 不变就复用；`Path2D` 按路径 id 缓存；逐形状 `setTransform`（避免 save/restore）。
- **CSS 3D 场景**（`render.ts` 的 `renderAvatarScene/sceneFrame`）：每个截面是一个小 SVG，用
  `translateZ/rotateY` 放好，让合成器做投影与遮挡；每帧只改几个 transform。代价是每片一个合成层。
- **SVG 静帧**：`renderAvatarSvg` 把一帧序列化成独立文件，眼睛、彩带渐变都在里面。

### 3.10 校验

`validate.ts` 的硬规则：字段白名单、`version=1`、id slug、name 1–40 且不含 `<>`、路径限制、包围盒 6..94、
长边 ≥40 / 短边 ≥14、填充面积 ≥600、眼睛在 1.2 单位内边距下落在实心区域内、`spacing ≥ 1.75·4·scale`。
strict 目标（生成侧 + CI）：脸部主导质量、放大后眼睛有 4.5 净空、全向凝视可满行程、轮廓接缝不超过 0.3–2.5 的突变。

## 4. 关键常量（复刻保留）

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `EYE_W/EYE_H` | 4 / 11 | 中性眼睛尺寸 |
| `EYE_BOOST` / `EYE_BOOST_PAD` | 1.45 / 3 | 眼睛放大上限与净空 |
| `FACE_ROOM_TARGET` | 4.5 | 生成目标的净空 |
| `GAZE_X/GAZE_Y` | 1.5 / 1.1 | 最大凝视行程（scale 1） |
| `MAX_PART_DEPTH` | 30 | 单部件最大厚度 |
| `DEFAULT_DEPTH` / `MAX_DEPTH` | 6 / 14 | UI 深度 |
| `BASE_YAW/BASE_PITCH` | −0.3 / 0.2 rad | 静止视角 |
| `HOOP_TILT/HOOP_ROLL` | 0.386 / 0.157 rad | 彩带环姿态 |
| `DONE_TURN_S/DONE_CYCLE_S` | 3.87 / 6.2 s | 完成动作 |
| `FLATNESS` | 0.02 | 曲线展平误差 |

## 5. 性能设计（值得抄的部分）

1. `prepare()` 按 `(id,name,path,eyes,depth)` 缓存整份体积与路径 id，上限 64 条。
2. 网格采样 + `runRange` 预筛：一整段格子若在等值面同侧，整段跳过。
3. 细部裁剪：只对"细"的区域补高密度切片。
4. 逐帧只重算姿态与矩阵；几何、`Path2D`、渐变都已缓存。
5. canvas 位图动态 fit（`fitSquare`）：不是按"所有可能视角"预留，而是按这一帧实际绘制范围扩。
6. 小尺寸头像降采样（`size < 128` → 30fps；截面间隔 < 0.75px 丢弃）。

## 5.5 复刻阶段新增：表情系统与自研形象库

上游只有 `neutral` / `happy` 两种情绪，眼睛只有 2 个自由度（笑弧、细缝）。复刻版把“脸”做成独立于状态的第二根轴，并把形象库换成 33 个全自研几何。

**眼睛模型：6 个连续参数 + 2 个辅助量**

| 参数 | 含义 | 实现 |
| --- | --- | --- |
| `arc` | 笑眼弧 | 描边轮廓（上下两条边 + 圆头） |
| `slit` | 扁细缝 | 旋转的薄胶囊 |
| `wide` | 惊讶 | 药丸定向更高更圆（`open × (1 + 0.2·wide)`） |
| `star` | 星光 | 近方形四角星，顶点后插软化点再重采样 |
| `lid` | 困倦 | “上缘平、下缘圆”的半闭眼，与药丸按权重混 |
| `tilt` | 眼轴倾斜 | 混完之后统一绕眼心旋转（`tilt × 0.25` rad） |
| `wink` | 单眼闭合 | 左眼改走“闭眼线”形状（浅抛物线胶囊） |
| `glint` | 高光 | 眼球左上角一个身体色实心圆，闭眼/笑弧时自动关闭 |

所有形状都从顶部中心顺时针采样 40 点再按权重求和，因此任意两个表情之间都能连续过渡，
`expression` 覆盖可以把它半途叠在现有表情上（0..1 权重）。

**确定性微表情**：`microAt(seed,t)` 每 3.4 s 一个槽位、约 42% 概率在槽内某个时刻闪一瞬
（惊讶/好奇/不爽/困倦之一，正弦权重 0..0.8）；`blinkAt` 现在按表情换节奏（困 7.4 s/0.46 s 闭合、
惊讶 2.4 s/0.13 s 短促），并带连眨概率；`reducedMotion` 下全部归零。

**弹性身体**：`elasticityOf(bounds)` 用宽高比算椭圆度（0.55..1.5），再对姿态的
`sy/sx/lift/roll` 偏差做放大。于是圆球压得狠、瘦长物件几乎不动——这就是“弹性球体”的手感来源。

**姿态过渡**：`RenderOptions.poseBlend = { from, t }` 把上一帧的 `Pose` 与新姿态按 smoothstep 混合。
因为 `Pose` 全是数字（含 `eyes` 的八个分量），一次混合同时覆盖身体动作与表情，中途再切也不会跳。
UI 每帧把 `frame.pose` 存下来，任何状态/表情/瞬时反应的变化都用它做 420 ms 过渡（`reducedMotion` 下直接切）。

**完成态粒子**：`bloomPieces(bounds, seed, age, energy, palette)` 是纯函数。每粒的延迟、寿命、速度、
大小、旋向都由 `noise(seed, …)` 散列；位移用 `1 − e^{−age·2.6}` 的炸开曲线，大小用 `sin(πt)` 涨落，
缩到 0 就是淡出（我们的填充不透明，所以用尺寸而不是透明度做消散）。粒子按朝向分前后两批插入绘制顺序，
颜色取身体色 OKLCH 色阶的中段。

**形象库**：38 个定义全部由 `scripts/gen-gallery.mjs` 的图元拼出（圆、椭圆、圆角矩形、多边形、
星形、环带、Catmull-Rom 平滑 blob），并逐条跑运行时校验。弹性质感靠 `blob` + 椭圆度，
云用多圆并集，月亮/骰子/甜甜圈用反向绕行的孔洞，星球用环带多边形。

**Hermes 系列**（`hermes` / `caduceus` / `wing` / `bolt` / `scroll`）是把"信使"的符号系统压成可渲染剪影：
翼盔给出头顶的两片羽翼、双蛇杖把杖头圆盘当作脸并用 `tube()` 生成蛇身、卷轴用两侧卷边圆暗示纸卷、
闪电与单翼负责"速度"那一层语义。所有附属物都从主导体上长出来（共用 nonzero 并集），保证缩放后仍是一个团。

## 6. 复刻映射（本工作区）

| 原实现 | 本工作区 | 说明 |
| --- | --- | --- |
| pnpm monorepo（core + site） | 单包 `avatar-forge` | 一个包、一个 dev server，去掉构建编排成本 |
| React 站点 | 原生 TS + DOM | 交互量不大，无框架也能验证渲染 |
| `path.ts` + `distance.ts` + `contour.ts` | `src/core/path.ts` + `field.ts` | 合并距离/等值线；索引简化为一遍算术 |
| `volume.ts` | `src/core/volume.ts` | 三类部件、圆角高度场、双叠截面、细部细分、眼窝 |
| `validate.ts` | `src/core/validate.ts` | 同样的硬规则与净空/行程计算 |
| `render.ts` + `effects.ts` | `frame.ts` + `fx.ts` | 帧装配、投影、彩带、标记 |
| `motion.ts`/`mood.ts`/`animator.ts` | `pose.ts` | 确定性姿态；缓动放到 UI 里做（见下） |
| `dom/paint.ts` | `paint.ts` | canvas 位图 fit + Path2D 缓存 |
| `eyes.ts`/`color.ts`/`svg.ts` | 同名文件 | 形态与色阶保留 |
| `fluffy/`（WebGL 绒毛） | 未复刻 | 需要 GLSL 网格与 WebGL2，属于另一条产品支线 |
| CSS 3D `scene` 后端 | 未复刻 | canvas + SVG 已覆盖"静态/动效"两条需求 |
| `apps/site/scripts/*`（banner/OG/图标） | 未复刻 | 营销素材生成，不影响运行时 |

**刻意不同的设计选择**：

- 姿态缓动（`moodBlend`）没有做进渲染器，而是 UI 只在切换状态时用 420ms 的插值改参数——复刻的 `computePose`
  因此少了 `blend` 参数，接口更窄。
- 彩带用屏幕空间法线扩宽 + 分段可见性判定，替代原始的 3D 中线/切向/端帽构造；视觉近似，代码量减半。
- 渲染顺序里没有单独的 `mark` 路径缓存清理，直接把标记路径塞进同一张 defs 表。

## 7. 复刻验证（实机证据）

`npm test`（vitest，65 个用例）：

- 契约：10 个图库定义全部通过校验、能构建体积、能出帧、能出 SVG；脸部余量 ≥1.08 倍、净空 >0。
- 几何：相对命令解析、曲线展平包围盒、非法标记拒绝、孔洞面积扣减、绕数一致性。
- 等值线：圆心距离场在 0.5 网格上追踪出面积误差 <3% 的圆。
- 投影：把可见截面投影回去，对轮廓内部（离边 >2 单位）的采样点覆盖率 **>98%**。
- 帧：同输入逐字节一致；改时钟即变；转过 90° 切换到侧叠；阻塞态让位给标记；工作/完成时出现彩带，
  减动效时没有；depth=0 只剩核心截面且厚度 0。
- 表情：八种表情至少给出六套不同的眼睛配方；`expression` 权重可线性叠加；wink 的闭眼与笑弧同时成立；
  高光只出现在睁着且有眼球的眼上；空闲时同 seed 会闪过多种眼睛状态，`reducedMotion` 下恒定；
  圆身子的压扁幅度大于瘦长身子。
- 图库：38 个定义逐个通过校验、建体积、出帧、出静帧 SVG。
- 过渡：`poseBlend` 的 t=0 等于起点、t=1 等于终点、t=0.5 恰好是中点；表情在中间帧是中间形状。
- 粒子：done 态出现 >12 粒、2.6 s 后数量下降、`reducedMotion` 下不炸。

浏览器探针（Chrome，1440×1000，DPR 2，`#stage` 截图后用像素分类转 ASCII 校验）：

- 舞台稳定 56–60 fps；canvas 位图尺寸随绘制范围变化。
- 静止：球体 + 灯颈 + 灯座轮廓正确，双眼在球体上部（ink `#151515`，约 2200 像素）。
- 状态：`thinking` 出现三个圆点、`blocked` 出现感叹号的胶囊 + 圆点、`working` 周期性出现彩带
  （尾部 bbox 从 360 变宽到 432 设备像素）、`done` 在彩带笼中旋转。
- 转体：拖动 1.6 rad 后正面宽度 522 → 335 设备像素，眼睛随切平面转走。
- 导入：合法 JSON 进入图库并被选中；非法（眼睛越界）在面板里给出人类可读的错误。
- 导出：SVG 45 KB（含 defs 与渐变）；PNG 1024×1024 RGBA，背景透明，主体为身体色与墨色。

## 8. 未验证 / 未知

- 原实现的 `fluffy` 材质（WebGL 绒毛渲染）只读了代码，没有在本机复现，也没有与之对比。
- 原站的 `studio/*` 面板行为（分享链接、提示词复制、修复提示词）没有逐条复现，只复刻了主交互。
- 原仓库 CI（GitHub Pages / release / changeset）没有运行。
- 原实现的性能数据没有测；本文的性能结论只针对复刻。
- 原实现的 `EdgeIndex`/`EdgeBands` 分桶算法在超大轮廓（数千边）下的表现未做基准对比。