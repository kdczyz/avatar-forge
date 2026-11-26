import { describe, expect, it } from 'vitest';
import { flattenPath, parsePath, serializePath, winding, filledArea, PathError, bounds } from '../src/core/path.ts';
import { contourLoops, segDist2, simplifyLoop } from '../src/core/field.ts';

const SQUARE = 'M20 20H80V80H20Z';
const HOLE = 'M20 20H80V80H20ZM40 40V60H60V40Z';

describe('path', () => {
  it('parses and normalizes relative commands', () => {
    const segs = parsePath('m20 20h60v60h-60z');
    const text = serializePath(segs);
    const polys = flattenPath(parsePath(text));
    const b = bounds(polys);
    expect(b).toEqual({ minX: 20, minY: 20, maxX: 80, maxY: 80 });
  });

  it('flattens curves within the flatness bound', () => {
    const polys = flattenPath(parsePath('M20 50C20 20 80 20 80 50C80 80 20 80 20 50Z'));
    expect(polys[0].length).toBeGreaterThan(20);
    // 所有采样点都在曲线的包围盒附近。
    const b = bounds(polys);
    expect(b.minX).toBeGreaterThan(18);
    expect(b.maxX).toBeLessThan(82);
  });

  it('rejects unsupported markup', () => {
    expect(() => parsePath('M0 0 L10 10 <script>')).toThrow(PathError);
    expect(() => parsePath('M0 0 L10 10 200 10')).toThrow(/outside/);
  });

  it('counts a hole out of the fill (nonzero)', () => {
    const polys = flattenPath(parsePath(HOLE));
    const solid = filledArea(flattenPath(parsePath(SQUARE)));
    const withHole = filledArea(polys);
    expect(solid).toBeGreaterThan(3000);
    expect(withHole).toBeGreaterThan(2000);
    expect(withHole).toBeLessThan(solid - 300);
  });

  it('winding agrees with point tests', () => {
    const polys = flattenPath(parsePath(HOLE));
    expect(winding(polys, 30, 30)).toBe(1);
    expect(winding(polys, 50, 50)).toBe(0);
    expect(winding(polys, 10, 50)).toBe(0);
  });
});

describe('field', () => {
  it('segDist2 handles degenerate segments', () => {
    expect(segDist2(0, 0, 0, 0, 0, 0)).toBe(0);
    expect(segDist2(3, 4, 0, 0, 0, 0)).toBe(25);
  });

  it('traces the contour of a distance field as a circle', () => {
    // 圆心 (50, 50)、半径 25 的带符号距离场。
    const step = 0.5;
    const nx = 201;
    const ny = 201;
    const x0 = 0;
    const y0 = 0;
    const values = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step;
        const y = y0 + j * step;
        values[j * nx + i] = 25 - Math.hypot(x - 50, y - 50);
      }
    }
    const loops = contourLoops({ values, nx, ny, x0, y0, step }, 0);
    expect(loops.length).toBe(1);
    const area = Math.abs(
      loops[0].reduce((sum, p, i) => {
        const q = loops[0][(i + 1) % loops[0].length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0) / 2,
    );
    // 半格采样误差允许 3%。
    expect(area).toBeGreaterThan(Math.PI * 25 * 25 * 0.97);
    expect(area).toBeLessThan(Math.PI * 25 * 25 * 1.03);
    for (const [x, y] of loops[0]) expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(25, 0);
  });

  it('simplifies collinear points away', () => {
    const line = Array.from({ length: 40 }, (_, k) => [k, 0] as [number, number]);
    expect(simplifyLoop(line, 0.05).length).toBeLessThan(6);
  });
});