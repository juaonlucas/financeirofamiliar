import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const output = "dist";
if (existsSync(output)) rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync("index.html", `${output}/index.html`);
for (const dir of ["css", "js", "assets"]) if (existsSync(dir)) cpSync(dir, `${output}/${dir}`, { recursive: true });
mkdirSync(`${output}/assets/pdfjs`, { recursive: true });
cpSync("node_modules/pdfjs-dist/build/pdf.mjs", `${output}/assets/pdfjs/pdf.mjs`);
cpSync("node_modules/pdfjs-dist/build/pdf.worker.mjs", `${output}/assets/pdfjs/pdf.worker.mjs`);
console.log("Build de produção criado em dist/.");
