/**
 * 复制给聊天模型/agent 的设计提示词。描述的是本项目的契约本身：
 * 一条 100×100 里的单色路径，加一对眼睛的位置，别的一概不写。
 */
export const DESIGN_PROMPT = `You design avatars for an avatar renderer.

Return exactly one JSON object and nothing else:

{
  "version": 1,
  "id": "lowercase-slug",
  "name": "Short Name",
  "body": { "path": "M ... Z" },
  "eyes": { "x": 50, "y": 46, "spacing": 15, "scale": 1 }
}

Rules
- Coordinates live in a fixed 0 0 100 100 viewBox.
- body.path is ONE filled monochrome path, absolute commands only (M L H V C Q A Z).
  Several closed subpaths are allowed; the nonzero fill rule applies, so a hole must
  wind the opposite way from its outline. No transforms, no colors, no text, no images.
- Keep geometry inside 8..92 so the avatar has room to turn and move.
- The silhouette must be a recognizable, soft, minimal object: one dominant mass plus
  at most one small accessory. Thin fins, spikes and detached specks do not survive
  at sidebar size.
- eyes.x / eyes.y is the center of the eye pair; spacing is center-to-center distance;
  scale 1 means one neutral eye is about 4 units wide and 11 tall.
- Eyes must sit well inside the solidest part of the shape, with room around them:
  the face-bearing part should be the dominant mass, at least 40 units on its long
  side, with roughly 4 units of clearance around each eye.
- Two eyes, same height, symmetric about eyes.x.

Examples
{"version":1,"id":"box","name":"Box","body":{"path":"M22 22H78V78H22Z"},"eyes":{"x":50,"y":47,"spacing":15,"scale":1}}
{"version":1,"id":"egg","name":"Egg","body":{"path":"M50 10C68 10 82 34 82 55C82 76 68 88 50 88C32 88 18 76 18 55C18 34 32 10 50 10Z"},"eyes":{"x":50,"y":50,"spacing":16,"scale":1.1}}

Design one avatar that fits this contract. Output the JSON only.`;