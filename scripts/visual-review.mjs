// Uses the same throwaway database/server lifecycle as the existing e2e suite.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const directory = "web/visual-review";
mkdirSync(directory, { recursive: true });
rmSync(join(directory, "results.json"), { force: true });
const child = spawn(process.execPath, ["scripts/e2e.mjs", "--config=playwright.visual.config.ts", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, VISUAL_REVIEW: "1" },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
  const results = join(directory, "results.json");
  if (existsSync(results)) {
    const { stats } = JSON.parse(readFileSync(results, "utf8"));
    writeFileSync(join(directory, "run-report.md"), `# Headless visual review\n\n${new Date().toISOString()}\n\nExit code: ${code}. Passed: ${stats.expected}; failed: ${stats.unexpected}; skipped: ${stats.skipped}.\n\nScreenshots use motion-enabled final states. Gallery manifests identify the local fixture instance and browser errors. Review the images before accepting layout changes; this command does not approve image baselines. See ../../VISUAL_REVIEW.md for the completed human-visible inspection record.\n`);
  }
  const sections = ["before", "after"].filter((phase) => existsSync(join(directory, phase))).map((phase) => {
    const pictures = readdirSync(join(directory, phase)).filter((name) => name.endsWith(".png"));
    return `<h2>${phase}</h2><div>${pictures.map((name) => `<figure><a href="${phase}/${name}"><img loading="lazy" src="${phase}/${name}" alt="${name}"></a><figcaption>${name}</figcaption></figure>`).join("")}</div>`;
  });
  writeFileSync(join(directory, "index.html"), `<!doctype html><html lang="en-US"><meta charset="utf-8"><title>codebases visual review</title><style>body{font:15px system-ui;margin:32px;color:#111827}div{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}img{width:100%;height:420px;object-fit:contain;object-position:top;border:1px solid #e5e7eb}figcaption{margin-top:8px}</style><h1>codebases visual review</h1><p>Click any screenshot to inspect it at full size. Synthetic local fixtures only; solution bodies are masked.</p>${sections.join("")}</html>`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
