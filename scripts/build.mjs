import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const output = "dist";
if (existsSync(output)) rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ["index.html", "styles.css", "enhancements.css", "app.js", "enhancements.js", "cloud-sync.js"]) {
  cpSync(file, `${output}/${file}`);
}
if (existsSync("assets")) cpSync("assets", `${output}/assets`, { recursive: true });
console.log("Build de produção criado em dist/.");

