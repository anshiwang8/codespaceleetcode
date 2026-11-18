// Fails if the browser bundle carries a secret.
//
//   node scripts/scan-bundle.mjs <next dist dir>
//
// Reads every file under <dist>/static, which is everything the browser downloads, and looks for:
//   - the exact values of the server-only variables named in FORBIDDEN_ENV, read from this
//     process's environment (so a value is never on the command line or printed), and
//   - strings shaped like common credentials.
// It prints only the file and the kind of match, never the matched text.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const FORBIDDEN_ENV = [
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "GITHUB_CLIENT_SECRET",
  "RESEND_API_KEY",
  "SMTP_PASSWORD",
  "R2_SECRET_ACCESS_KEY",
  "R2_ACCESS_KEY_ID",
  "SUPABASE_DB_URL",
];

const SHAPES = [
  ["a Postgres URL with a password", /postgres(?:ql)?:\/\/[^\s"'`:/]+:[^\s"'`@]+@/],
  ["a GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["an AWS-style access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["a Resend API key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else yield full;
  }
}

const dist = process.argv[2];
if (!dist) {
  console.error("usage: node scripts/scan-bundle.mjs <next dist dir>");
  process.exit(2);
}
const root = join(dist, "static");
const values = FORBIDDEN_ENV.map((name) => [name, process.env[name] ?? ""]).filter(([, value]) => value.length >= 8);

const findings = [];
let scanned = 0;
for (const file of files(root)) {
  const text = readFileSync(file, "utf8");
  scanned += 1;
  for (const [name, value] of values) if (text.includes(value)) findings.push(`${relative(dist, file)}: the value of ${name}`);
  for (const [kind, pattern] of SHAPES) if (pattern.test(text)) findings.push(`${relative(dist, file)}: ${kind}`);
}

if (findings.length > 0) {
  console.error(`The browser bundle carries secrets (${findings.length}):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`Browser bundle: ${scanned} files, no secrets (${values.length} server values checked).`);
