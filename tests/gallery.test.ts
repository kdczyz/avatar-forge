import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateAvatar } from '../src/core/validate.ts';
import { buildVolume, faceRoom } from '../src/core/volume.ts';
import { renderSvg } from '../src/core/svg.ts';
import { computeFrame } from '../src/core/frame.ts';
import type { AvatarDefinition } from '../src/core/types.ts';

const dir = join(process.cwd(), 'gallery');
const fileNames = readdirSync(dir).filter((f) => f.endsWith('.json'));

function load(name: string): AvatarDefinition {
  return JSON.parse(readFileSync(join(dir, name), 'utf8')) as AvatarDefinition;
}

describe('gallery', () => {
  it('ships definitions', () => {
    expect(fileNames.length).toBeGreaterThan(3);
  });

  for (const name of fileNames) {
    it(`${name} validates and renders`, () => {
      const raw = load(name);
      const res = validateAvatar(raw);
      if (!res.ok) throw new Error(`${name}: ${res.errors.join('; ')}`);
      const def = res.value;

      const room = faceRoom(def);
      expect(room.boost).toBeGreaterThanOrEqual(1.08);
      expect(room.clearance).toBeGreaterThan(0);

      const vol = buildVolume(def, 1);
      expect(vol.parts.length).toBeGreaterThan(0);
      expect(vol.parts[0].depth).toBeGreaterThan(0);
      expect(vol.parts[0].zSlices.length).toBeGreaterThan(2);

      const frame = computeFrame(def, { color: '#ff6a1a', time: 1.3 });
      expect(frame.paths.length).toBeGreaterThan(0);
      expect(frame.shapes.length).toBeGreaterThan(2);
      // 眼睛一定被画出来（正面视角）。
      expect(frame.shapes.some((s) => s.kind === 'eye')).toBe(true);

      const svg = renderSvg(def, { time: 0.4, size: 128 });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 100 100"');
      expect(svg.includes('<path')).toBe(true);
    });
  }
});