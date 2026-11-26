import { describe, expect, it } from 'vitest';
import { EXPRESSIONS, POINT_COUNT, expressionRings, ringPath } from '../src/bot/ring.ts';
import { SpringEyeEngine } from '../src/bot/spring.ts';
import { BotScheduler } from '../src/bot/scheduler.ts';
import { SHAPES } from '../src/bot/shapes.ts';
import { PALETTES, derivePalette } from '../src/bot/palettes.ts';
import { validateAvatar } from '../src/core/validate.ts';
import { buildVolume } from '../src/core/volume.ts';
import { computeFrame } from '../src/core/frame.ts';
import { placement, remountCanvas, type Surface } from '../src/core/paint.ts';
import { renderSvg } from '../src/core/svg.ts';

describe('48-point eye rings', () => {
  it('provides 16 expressions with 48 clockwise points anchored at 3 o clock', () => {
    expect(EXPRESSIONS.length).toBe(16);
    for (const mood of EXPRESSIONS) {
      const [left, right] = expressionRings(mood);
      expect(left.length).toBe(POINT_COUNT);
      expect(right.length).toBe(POINT_COUNT);
      for (const ring of [left, right]) {
        // 索引 0 在右侧（x > 0），索引 12 在正下方（y > 0，屏幕顺时针）
        expect(ring[0].x).toBeGreaterThan(0.5);
        expect(ring[12].y).toBeGreaterThan(0);
        for (const p of ring) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
      }
      const d = ringPath(left, 50, 50, 1.2, 1);
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
    }
  });
});

describe('SpringEyeEngine', () => {
  it('supports mid-flight interruption without jumping and settles cleanly', () => {
    const engine = new SpringEyeEngine('neutral');
    expect(engine.isSettled()).toBe(true);

    engine.setExpression('surprised');
    expect(engine.isSettled()).toBe(false);
    for (let i = 0; i < 6; i++) engine.update(0.016);
    const midY = engine.getRings()[0][12].y;

    // 中途打断切换到 happy：source 应当从当前 display 接续，绝不跳回初始值或终点
    engine.setExpression('happy');
    engine.update(0);
    expect(engine.getRings()[0][12].y).toBeCloseTo(midY, 4);

    for (let i = 0; i < 120; i++) engine.update(0.016);
    expect(engine.isSettled()).toBe(true);
  });

  it('runs independent blink pulse and low-pass look offset', () => {
    const engine = new SpringEyeEngine('neutral');
    engine.setLookTarget(1, -0.5);
    engine.triggerBlink(false, 0.16);
    engine.update(0.08);
    expect(engine.getBlinkScale()).toBeLessThan(0.25);
    expect(engine.getLookOffset().x).toBeGreaterThan(0.3);
    expect(engine.getLookOffset().x).toBeLessThan(1);

    for (let i = 0; i < 60; i++) engine.update(0.016);
    expect(engine.getBlinkScale()).toBe(1);
  });
});

describe('BotScheduler', () => {
  it('cycles state moods, triggers blinks, and handles poke + sleep', () => {
    const scheduler = new BotScheduler({ state: 'thinking', rng: () => 0.5 });
    const firstMood = scheduler.activeMood;
    expect(['curious', 'skeptical', 'focused', 'confused']).toContain(firstMood);

    // 推进足够时间触发一次眨眼与表情轮换
    let sawBlink = false;
    for (let i = 0; i < 350; i++) {
      scheduler.update(0.02);
      if (scheduler.eyes.getBlinkScale() < 0.8) sawBlink = true;
    }
    expect(sawBlink).toBe(true);
    expect(scheduler.activeMood).not.toBe(firstMood);

    // 逗它一下会在 1.6s 后弹回
    scheduler.poke('love', 0.8);
    expect(scheduler.activeMood).toBe('love');
    for (let i = 0; i < 50; i++) scheduler.update(0.02);
    expect(scheduler.activeMood).not.toBe('love');

    // nextWakeDelayMs 与 advanceSleep 协同
    const delay = scheduler.nextWakeDelayMs();
    expect(delay).toBeGreaterThan(0);
    scheduler.advanceSleep(delay / 1000);
    expect(scheduler.stateAge).toBeGreaterThan(0);
  });
});

describe('9 canonical shapes & 12 palettes', () => {
  it('validates all 9 shapes including true 3D sphere and renders clay SVG frames', () => {
    expect(SHAPES.length).toBe(9);
    expect(PALETTES.length).toBe(12);
    const sphereShape = SHAPES.find((s) => s.id === 'sphere');
    expect(sphereShape).toBeDefined();
    const sphereVol = buildVolume(sphereShape!.definition, 1);
    expect(sphereVol.parts[0].kind).toBe('revolve-y');
    expect(sphereVol.parts[0].depth).toBeGreaterThan(70);

    for (let i = 0; i < SHAPES.length; i++) {
      const shape = SHAPES[i];
      expect(shape.unitPoints.length).toBeGreaterThanOrEqual(6);
      const res = validateAvatar(shape.definition);
      if (!res.ok) throw new Error(`${shape.id}: ${res.errors.join('; ')}`);

      const palette = PALETTES[i % PALETTES.length];
      const engine = new SpringEyeEngine('love');
      const svg = renderSvg(res.value, {
        color: palette.base,
        highlightColor: palette.highlight,
        shadowColor: palette.shadow,
        eyeColor: palette.eye,
        clay: true,
        orbit: true,
        badge: 'blue',
        eyeRings: engine.getRings(),
        blinkScale: 1,
        size: 128,
      });
      expect(svg).toContain('<filter id="clay-');
      expect(svg).toContain('feComposite');
      expect(svg).not.toContain('NaN');
    }

    const custom = derivePalette('#336699');
    expect(custom.highlight).toMatch(/^#[0-9a-f]{6}$/);
    expect(custom.shadow).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('forwards expression, eyeRings, orbit and badge in computeFrame', () => {
    const def = SHAPES[0].definition;
    const engine = new SpringEyeEngine('joy');
    const frame = computeFrame(def, {
      state: 'alert',
      mood: 'neutral',
      expression: { mood: 'surprised', weight: 1 },
      eyeRings: engine.getRings(),
      blinkScale: 0.9,
      orbit: true,
      badge: 'red',
      clay: true,
      time: 1.2,
    });
    expect(frame.clay).toBe(true);
    expect(frame.pose.eyes.wide).toBeGreaterThan(0.9);
    expect(frame.shapes.some((s) => s.kind === 'particle' && s.key.startsWith('orbit-'))).toBe(true);
    expect(frame.shapes.some((s) => s.kind === 'particle' && s.key === 'badge-dot')).toBe(true);
    expect(frame.shapes.filter((s) => s.kind === 'eye').length).toBe(2);
  });

  it('keeps valid sliceBounds and complete slices across side-view rotations', () => {
    const def = SHAPES[0].definition;
    for (const yaw of [-1.4, -0.9, 0, 0.9, 1.4]) {
      const frame = computeFrame(def, { view: { yaw, pitch: 0.1 }, clay: true, time: 0 });
      const { sliceBounds } = placement(frame);
    expect(sliceBounds.x1).toBeGreaterThan(sliceBounds.x0);
    expect(sliceBounds.y1).toBeGreaterThan(sliceBounds.y0);
    expect(frame.shapes.filter((s) => s.kind === 'slice').length).toBeGreaterThan(4);
    }
  });

  it('blends seamlessly from last tail frame across state transitions and reuses surface', () => {
    const defA = SHAPES[0].definition;
    const defB = SHAPES[1].definition;
    const f1 = computeFrame(defA, { state: 'thinking', mood: 'curious', time: 1.0 });
    // 从 f1 的尾帧 pose 过渡到 blocked 状态：t=0 时应当完全延续 f1.pose，不发生首帧硬切
    const f2Start = computeFrame(defB, { state: 'blocked', mood: 'sad', time: 1.016, poseBlend: { from: f1.pose, t: 0 } });
    expect(f2Start.pose.dots).toBeCloseTo(f1.pose.dots, 5);
    expect(f2Start.pose.bang).toBeCloseTo(f1.pose.bang, 5);
    expect(f2Start.pose.roll).toBeCloseTo(f1.pose.roll, 4);

    // 过渡中段继续打断切换到 working，仍从当前帧平滑接续
    const f2Mid = computeFrame(defB, { state: 'blocked', mood: 'sad', time: 1.2, poseBlend: { from: f1.pose, t: 0.45 } });
    const f3Start = computeFrame(defB, { state: 'working', mood: 'focused', time: 1.216, poseBlend: { from: f2Mid.pose, t: 0.02 } });
    expect(Math.abs(f3Start.pose.bang - f2Mid.pose.bang)).toBeLessThan(0.05);

    // remountCanvas 应当复用已有 Surface 与 clay 引用，不重新创建
    const fakeClay = { body: {}, bodyCtx: {}, mask: {}, maskCtx: {}, front: {}, frontCtx: {} } as unknown as Surface['clay'];
    const surface: Surface = {
      canvas: {} as HTMLCanvasElement,
      ctx: null,
      cap: { x: 0, y: 0, size: 100 },
      fit: { x: 2, y: 2, size: 96 },
      layout: '320|1',
      left: 0,
      top: 0,
      clay: fakeClay,
    };
    const reused = remountCanvas(surface, defB, 6);
    expect(reused).toBe(surface);
    expect(reused.clay).toBe(fakeClay);
  });
});
