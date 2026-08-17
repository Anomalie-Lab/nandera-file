import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  TEMPLATE_FILENAME,
  buildClientTemplateBuffer,
} from "../src/lib/excel-client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "templates");
const outFile = join(outDir, TEMPLATE_FILENAME);

async function main() {
  const buf = await buildClientTemplateBuffer();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, buf);
  console.log("Wrote", outFile, buf.length, "bytes");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
