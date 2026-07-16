import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

/**
 * Génère les favicons/icônes manquants à partir du logo vectoriel déjà
 * fourni (aucun redessin — simple conversion mécanique SVG → PNG/ICO).
 * Source : app-icon-blue-solid.svg (fond bleu plein) — un simple trait sur
 * fond transparent devient illisible à ces toutes petites tailles.
 *
 *   npx tsx src/scripts/generateBrandAssets.ts
 */
const SOURCE_SVG = path.join(
  __dirname,
  "..",
  "..",
  "ASSETS:LOGOS",
  "app-icon-blue-solid.svg",
);
const OUTPUT_DIR = path.join(__dirname, "..", "public", "dashboard-assets");

const PNG_TARGETS: Array<{ file: string; size: number }> = [
  { file: "favicon-16.png", size: 16 },
  { file: "favicon-32.png", size: 32 },
  { file: "favicon-48.png", size: 48 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const pngBuffers: Record<string, Buffer> = {};
  for (const { file, size } of PNG_TARGETS) {
    const buffer = await sharp(SOURCE_SVG).resize(size, size).png().toBuffer();
    pngBuffers[file] = buffer;
    await writeFile(path.join(OUTPUT_DIR, file), buffer);
    console.log(`Généré : ${file} (${size}x${size})`);
  }

  const icoBuffer = await pngToIco([
    pngBuffers["favicon-16.png"],
    pngBuffers["favicon-32.png"],
    pngBuffers["favicon-48.png"],
  ]);
  await writeFile(path.join(OUTPUT_DIR, "favicon.ico"), icoBuffer);
  console.log("Généré : favicon.ico (16+32+48)");

  console.log(`\nTerminé. Fichiers écrits dans ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
