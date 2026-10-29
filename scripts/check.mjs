import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const modules = readdirSync("js").filter(f => f.endsWith(".js")).map(f => `js/${f}`);
for (const file of [...modules, "api/state.js"]) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });

const html = readFileSync("index.html", "utf8");
for (const ref of ["css/app.css", "js/main.js"]) if (!html.includes(ref)) throw new Error(`Referência ausente no HTML: ${ref}`);
for (const id of ["view", "tabs", "tabsBar", "months", "topActions", "subtitle", "dialog", "toast", "sync"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Elemento obrigatório ausente: ${id}`);
}
// Todo import relativo precisa apontar para um arquivo existente.
for (const file of modules) {
  for (const [, path] of readFileSync(file, "utf8").matchAll(/from "\.\/([^"]+)"/g)) {
    if (!existsSync(`js/${path}`)) throw new Error(`${file} importa arquivo inexistente: ${path}`);
  }
}
for (const photo of ["rosa.png", "wedja.png", "aianny.png", "evane.png", "joao-lucas.png", "ju-wellington.png", "kauany.png"]) {
  if (!existsSync(`assets/rostos/${photo}`)) throw new Error(`Foto de perfil ausente: ${photo}`);
}
console.log("Lint e verificações estruturais concluídos.");
