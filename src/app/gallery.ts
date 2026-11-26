/** 图库：gallery/*.json 在构建时打包进来，加载后逐条校验，不可用的直接跳过。 */
import { validateAvatar } from '../core/validate.ts';
import type { AvatarDefinition } from '../core/types.ts';

const files = import.meta.glob('../../gallery/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const GALLERY: AvatarDefinition[] = Object.keys(files)
  .sort()
  .flatMap((path) => {
    const res = validateAvatar(files[path]);
    return res.ok ? [res.value] : [];
  });

export function findDefinition(id: string): AvatarDefinition | undefined {
  return GALLERY.find((d) => d.id === id);
}