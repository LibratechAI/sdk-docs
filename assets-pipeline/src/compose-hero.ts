// Builds the Welcome page image: the Figma research-product mockup with its
// SDK panel replaced by the real `sdk-home` capture. Rerun after recapturing it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BACKGROUND = path.join(ROOT, "assets-pipeline/fixtures/host-product-figma.png");
const PANEL = path.join(ROOT, "images/capabilities/sdk-home.png");
const OUTPUT = path.join(ROOT, "images/libra-add-in-host-product.png");

// SDK panel area in the Figma mockup, inside its left and top border lines.
const AREA = { left: 1125, top: 56, width: 475, height: 844 };
// Empty rows in the capture to drop so it fits the area's taller aspect ratio.
const SKIP_ROWS: Array<[number, number]> = [
  [320, 402],
  [1100, 1183],
];

const panel = sharp(PANEL);
const { width = 0, height = 0 } = await panel.metadata();
const keep: Array<[number, number]> = [];
let start = 0;
for (const [from, to] of SKIP_ROWS) {
  keep.push([start, from]);
  start = to;
}
keep.push([start, height]);

const slices = await Promise.all(
  keep.map(([top, bottom]) =>
    sharp(PANEL).extract({ left: 0, top, width, height: bottom - top }).png().toBuffer(),
  ),
);
let offset = 0;
const stitchedHeight = keep.reduce((sum, [top, bottom]) => sum + bottom - top, 0);
const stitched = await sharp({
  create: { width, height: stitchedHeight, channels: 3, background: "#ffffff" },
})
  .composite(
    slices.map((input, i) => {
      const top = offset;
      offset += keep[i][1] - keep[i][0];
      return { input, left: 0, top };
    }),
  )
  .png()
  .toBuffer();

const resized = await sharp(stitched)
  .resize(AREA.width, AREA.height, { fit: "fill", kernel: "lanczos3" })
  .png()
  .toBuffer();

await sharp(BACKGROUND)
  .composite([{ input: resized, left: AREA.left, top: AREA.top }])
  .png()
  .toFile(OUTPUT);

console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${stitchedHeight}px of ${height}px panel height kept).`);
