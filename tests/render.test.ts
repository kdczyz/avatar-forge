import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeFrame, activeStack, viewBasis, prepare, planeMatrix, sidePlaneMatrix, type Frame } from '../src/core/frame.ts';
import { glintPath } from '../src/core/eyes.ts';
import { edgeDistance } from '../src/core/field.ts';
import { winding } from '../src/core/path.ts';
import { renderSvg } from '../src/core/svg.ts';
import { computePose } from '../src/core/pose.ts';
import { buildVolume } from '../src/core/volume.ts';
import type { AvatarDefinition } from '../src/core/types.ts';

const def: AvatarDefinition = JSON.parse(readFileSync(join(process.cwd(), 'gallery/ghost.json'), 'utf8')) as AvatarDefinition;

const frameText = (time: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify(computeFrame(def, { color: '#ff6a1a', time, ...extra } as never));

describe('frame', () => {
  it('is deterministic for equal inputs', () => {
    expect(frameText(2.5)).toBe(frameText(2.5));
  });

  it('changes with the clock', () => {
    expect(frameText(2.5)).not.toBe(frameText(2.6));
  });

  it('has a pose that breathes and blinks over time', () => {
    const a = computePose({ seed: 7, time: 0.25, reducedMotion: false });
    const b = computePose({ seed: 7, time: 1.6, reducedMotion: false });
    expect(a.yaw).not.toBeCloseTo(b.yaw, 4);
    let top = 0;
    for (let t = 0; t < 12; t += 0.02) top = Math.max(top, computePose({ seed: 7, time: t, reducedMotion: false }).blink);
    expect(top).toBeGreaterThan(0.9);
  });

  it('switches to the side stack when turned', () => {
    expect(activeStack(viewBasis(-0.3, 0.2))).toBe('z');
    expect(activeStack(viewBasis(-1.4, 0.1))).toBe('x');
    const turned = computeFrame(def, { time: 0, view: { yaw: -1.45, pitch: 0.1 } });
    expect(turned.shapes.length).toBeGreaterThan(2);
    // 侧视角下眼睛转到看不见，但身体仍在。
    expect(turned.shapes.some((s) => s.kind === 'slice')).toBe(true);
  });

  it('gives way to the blocked mark', () => {
    const frame = computeFrame(def, { state: 'blocked', time: 0.7 });
    expect(frame.shapes.some((s) => s.kind === 'mark')).toBe(true);
  });

  it('draws ribbons on working turns', () => {
    const working = computeFrame(def, { state: 'working', stateAge: 1.9, time: 1.9 });
    expect(working.shapes.some((s) => s.kind === 'ribbon')).toBe(true);
    const calm = computeFrame(def, { state: 'working', stateAge: 1.9, time: 1.9, reducedMotion: true });
    expect(calm.shapes.some((s) => s.kind === 'ribbon')).toBe(false);
  });

  it('celebrates done with a particle bloom, not ribbons', () => {
    const done = computeFrame(def, { state: 'done', stateAge: 0.6, time: 0.6 });
    const particles = done.shapes.filter((s) => s.kind === 'particle');
    expect(particles.length).toBeGreaterThan(12);
    expect(done.shapes.some((s) => s.kind === 'ribbon')).toBe(false);
    // 粒子有了自己的时间轴之后会继续飘散、缩没。
    const later = computeFrame(def, { state: 'done', stateAge: 2.6, time: 2.6 });
    const laterParticles = later.shapes.filter((s) => s.kind === 'particle');
    expect(laterParticles.length).toBeLessThan(particles.length);
    // 静止偏好下不炸。
    const calm = computeFrame(def, { state: 'done', stateAge: 0.6, time: 0.6, reducedMotion: true });
    expect(calm.shapes.some((s) => s.kind === 'particle')).toBe(false);
  });

  it('eases between poses instead of cutting', () => {
    const target = computePose({ seed: 9, time: 2.4, state: 'thinking', mood: 'angry', reducedMotion: true });
    const from = computePose({ seed: 9, time: 2.4, state: 'idle', mood: 'happy', reducedMotion: true });
    const frameAt = (t: number) => computeFrame(def, { state: 'thinking', mood: 'angry', time: 2.4, reducedMotion: true, poseBlend: { from, t } });
    const a = frameAt(0).pose;
    const mid = frameAt(0.5).pose;
    const b = frameAt(1).pose;
    // 弹性系数会等比放大 roll，所以用两端比值验算，再看中点是不是真正的一半。
    const k = b.roll / target.roll;
    expect(a.roll).toBeCloseTo(from.roll * k, 6);
    expect(mid.roll).toBeCloseTo(((from.roll + target.roll) / 2) * k, 4);
    expect(a.roll).not.toBeCloseTo(b.roll, 3);
    // 表情也是真的在中间：happy(0) → angry(0.78) 的一半。
    expect(mid.eyes.slit).toBeGreaterThan(0.1);
    expect(mid.eyes.slit).toBeLessThan(0.7);
  });

  it('adds slices with depth and none at depth 0', () => {
    const flat = buildVolume(def, 0);
    expect(flat.parts[0].depth).toBe(0);
    expect(flat.parts[0].zSlices.length).toBe(1);
    expect(buildVolume(def, 1).parts[0].zSlices.length).toBeGreaterThan(6);
  });

  it('keeps every path and matrix finite', () => {
    for (const state of ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done'] as const) {
      const svg = renderSvg(def, { state, stateAge: 2, time: 2.2, mood: 'happy' });
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('Infinity');
    }
  });

  it('reuses one prepared volume per definition and depth', () => {
    const a = prepare(def, 6);
    const b = prepare(def, 6);
    expect(a).toBe(b);
    expect(prepare(def, 3)).not.toBe(a);
  });
});
describe('projection', () => {
  it('projects the slice stack back onto the silhouette', () => {
    const p = prepare(def, 6);
    const { vol } = p;
    const b = vol.bounds;
    const [cx, cy] = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    const pose = computePose({ seed: p.seed, time: 0.9, reducedMotion: false, state: 'idle', mood: 'neutral' });
    const v = viewBasis(pose.yaw, pose.pitch);
    const stack = activeStack(v);

    // 把每条可见截面的环投影到屏幕，得到并集多边形。
    const polys: [number, number][][] = [];
    for (const part of vol.parts) {
      for (const s of stack === 'z' ? part.zSlices : part.xSlices) {
        const m = stack === 'z' ? planeMatrix(v, s.at, [cx, cy]) : sidePlaneMatrix(v, s.at, [cx, cy]);
        for (const loop of s.loops) {
          polys.push(loop.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as [number, number]));
        }
      }
    }
    const inside = (x: number, y: number) => {
      let w = 0;
      for (const poly of polys) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i];
          const [xj, yj] = poly[j];
          if (yj <= y && yi > y) {
            const cross = (xi - xj) * (y - yj) - (x - xj) * (yi - yj);
            if (cross > 0) w++;
          } else if (yi <= y && yj > y) {
            const cross = (xi - xj) * (y - yj) - (x - xj) * (yi - yj);
            if (cross < 0) w--;
          }
        }
      }
      return w !== 0;
    };

    // 身体轮廓内部（离边 2 单位以上）的点应当被覆盖。
    let tested = 0;
    let covered = 0;
    for (let y = b.minY + 2; y < b.maxY - 2; y += 1.5) {
      for (let x = b.minX + 2; x < b.maxX - 2; x += 1.5) {
        if (winding(p.body.polys, x, y) === 0 || edgeDistance(p.body.polys, x, y) < 2) continue;
        tested++;
        if (inside(x, y)) covered++;
      }
    }
    expect(tested).toBeGreaterThan(200);
    expect(covered / tested).toBeGreaterThan(0.98);
  });
});

describe('expression', () => {
  const moods = ['neutral', 'happy', 'sleepy', 'surprised', 'curious', 'angry', 'love', 'wink'] as const;

  it('gives every mood its own eyes', () => {
    const seen = new Map<string, number>();
    for (const mood of moods) {
      const pose = computePose({ seed: 11, time: 2.2, mood, reducedMotion: true });
      const key = JSON.stringify(pose.eyes);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      expect(Number.isFinite(pose.eyes.glint)).toBe(true);
      expect(pose.eyes.wide).toBeGreaterThanOrEqual(0);
      expect(Math.abs(pose.eyes.tilt)).toBeLessThanOrEqual(1);
    }
    // 八个表情至少给出六种不同的眼睛配方。
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it('blends a transient expression over the standing mood', () => {
    const calm = computePose({ seed: 5, time: 1.1, mood: 'neutral', reducedMotion: true });
    const poked = computePose({ seed: 5, time: 1.1, mood: 'neutral', expression: { mood: 'surprised', weight: 1 }, reducedMotion: true });
    expect(calm.eyes.wide).toBe(0);
    expect(poked.eyes.wide).toBeGreaterThan(0.9);
    expect(poked.eyes.glint).toBeGreaterThan(calm.eyes.glint);
    const half = computePose({ seed: 5, time: 1.1, mood: 'neutral', expression: { mood: 'surprised', weight: 0.5 }, reducedMotion: true });
    expect(half.eyes.wide).toBeGreaterThan(0.4);
    expect(half.eyes.wide).toBeLessThan(0.6);
  });

  it('closes one eye for a wink and keeps both for a smile', () => {
    const wink = computeFrame(def, { mood: 'wink', time: 0.4, reducedMotion: true });
    const eyes = wink.shapes.filter((s) => s.kind === 'eye');
    expect(eyes.length).toBe(2);
    const shapes = eyes.map((e) => (e.kind === 'eye' ? e.mark.shape : ''));
    expect(shapes).toContain('path');
    const happy = computeFrame(def, { mood: 'happy', time: 0.4, reducedMotion: true });
    for (const e of happy.shapes) if (e.kind === 'eye') expect(e.mark.shape).toBe('arc');
  });

  it('paints a catchlight, and only on eyes that are open', () => {
    const glints = (f: Frame) => f.shapes.filter((s) => s.kind === 'mark' && s.key.startsWith('glint')).length;
    const open = computeFrame(def, { mood: 'surprised', time: 0.3, reducedMotion: true });
    expect(glints(open)).toBe(2);
    // wink：左眼是一条闭眼线，右眼是笑眼弧，两者都没有“眼球”，也就都没有高光。
    const wink = computeFrame(def, { mood: 'wink', time: 0.3, reducedMotion: true });
    expect(glints(wink)).toBe(0);
    // 半闭的眼睛（困）高光会缩到几乎没有，闭眼线本身不该有反光。
    const closedEyes = glintPath({ x: 50, y: 50, w: 6, h: 18, open: 1.2, shift: 0, closed: true }, 1);
    expect(closedEyes === null || closedEyes.r < 0.4).toBe(true);
  });

  it('flicks through micro expressions while idle and stays calm when reduced', () => {
    const moods = new Set<string>();
    for (let t = 0; t < 20; t += 0.05) {
      const pose = computePose({ seed: 3, time: t, mood: 'neutral', reducedMotion: false });
      moods.add(JSON.stringify(pose.eyes));
    }
    expect(moods.size).toBeGreaterThan(2);
    const calm = new Set<string>();
    for (let t = 0; t < 3; t += 0.1) {
      const pose = computePose({ seed: 3, time: t, mood: 'neutral', reducedMotion: true });
      calm.add(JSON.stringify(pose.eyes));
    }
    expect(calm.size).toBe(1);
  });
});

describe('elasticity', () => {
  it('squashes round bodies harder than tall ones', () => {
    const round = computeFrame({ ...def, body: { path: 'M50 10C72 10 90 28 90 50C90 72 72 90 50 90C28 90 10 72 10 50C10 28 28 10 50 10Z' }, eyes: { x: 50, y: 44, spacing: 16, scale: 1.1 } }, { time: 0.6 });
    const tall = computeFrame({ ...def, body: { path: 'M36 8H64V92H36Z' }, eyes: { x: 50, y: 44, spacing: 16, scale: 1.1 } }, { time: 0.6 });
    const sy = (f: typeof round) => f.root[3];
    const sx = (f: typeof round) => f.root[0];
    const squash = (f: typeof round) => Math.abs(sy(f) - 1) + Math.abs(sx(f) - 1);
    expect(squash(round)).toBeGreaterThan(squash(tall));
  });
});
