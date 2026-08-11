/**
 * Generates brand icons for tab favicons + PWA.
 * IMPORTANT: Render/Docker run this on every deploy — it must output the
 * arctic mountain/timer/snowflake mark, never a solid placeholder circle.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const root = process.cwd();
const outDir = join(root, "public", "icons");
const publicDir = join(root, "public");

mkdirSync(outDir, { recursive: true });

const svgPath = join(outDir, "icon.svg");
const svg = readFileSync(svgPath);

async function writePng(size: number, filePath: string) {
  await sharp(svg)
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(filePath);
}

/** Minimal ICO with one 32×32 PNG image (modern browsers accept PNG-in-ICO). */
function pngToIco(png: Buffer): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(1, 4); // count

  const entry = Buffer.alloc(16);
  entry[0] = 32; // width
  entry[1] = 32; // height
  entry[2] = 0; // colors
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset to image data

  return Buffer.concat([header, entry, png]);
}

async function main() {
  await writePng(16, join(outDir, "favicon-16.png"));
  await writePng(32, join(outDir, "favicon-32.png"));
  await writePng(180, join(outDir, "apple-touch-icon.png"));
  await writePng(192, join(outDir, "icon-192.png"));
  await writePng(512, join(outDir, "icon-512.png"));

  // Root favicon for browsers that request /favicon.ico by default
  const faviconPng = await sharp(svg)
    .resize(32, 32, { fit: "fill" })
    .png()
    .toBuffer();
  writeFileSync(join(publicDir, "favicon.ico"), pngToIco(faviconPng));
  await sharp(svg)
    .resize(32, 32, { fit: "fill" })
    .png()
    .toFile(join(publicDir, "favicon.png"));

  console.log("Brand icons generated in public/icons/ + public/favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
