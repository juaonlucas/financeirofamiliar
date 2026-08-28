import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

for (const file of ["app.js", "enhancements.js", "cloud-sync.js", "api/state.js"]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const html = readFileSync("index.html", "utf8");
for (const asset of ["styles.css", "enhancements.css", "app.js", "enhancements.js", "cloud-sync.js"]) {
  if (!html.includes(asset)) throw new Error(`Referência ausente no HTML: ${asset}`);
}
for (const id of ["kpis", "peopleGrid", "purchaseRows", "variationRows", "profileDialog", "profileProjection", "profileEnding", "profileShareImage", "shareDialog", "cloudMemoryDialog"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Elemento obrigatório ausente: ${id}`);
}
console.log("Lint e verificações estruturais concluídos.");

