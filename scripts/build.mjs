import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const output = "dist";
if (existsSync(output)) rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ["index.html", "styles.css", "enhancements.css", "app.js", "enhancements.js", "cloud-sync.js", "invoice-import.js"]) {
  cpSync(file, `${output}/${file}`);
}
if (existsSync("assets")) cpSync("assets", `${output}/assets`, { recursive: true });
mkdirSync(`${output}/assets/pdfjs`, { recursive: true });
cpSync("node_modules/pdfjs-dist/build/pdf.mjs", `${output}/assets/pdfjs/pdf.mjs`);
cpSync("node_modules/pdfjs-dist/build/pdf.worker.mjs", `${output}/assets/pdfjs/pdf.worker.mjs`);
console.log("Build de produção criado em dist/.");
