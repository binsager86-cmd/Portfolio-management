import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  ROOT,
  path.resolve(ROOT, "..", "backend-api"),
];

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".expo",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

const SKIP_PATH_PATTERNS = [
  /\/__tests__\//,
  /\/__mocks__\//,
  /(^|\/)test-results\.json$/,
  /(^|\/)code-audit\.txt$/,
  /(^|\/)full-code-audit\.txt$/,
  /(^|\/)app-audit\.txt$/,
  /(^|\/)fundamental-analysis-audit\.txt$/,
];

const ALLOWED_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".py", ".md", ".yml", ".yaml", ".env", ".txt",
]);

const PATTERNS = [
  /(PROD_PASS|PROD_NEWS_IMPORT_PASSWORD)\s*=\s*["'`][^"'`\n]{4,}["'`]/,
  /(SMTP_PASSWORD|GEMINI_API_KEY|CRON_SECRET_KEY|SECRET_KEY)\s*=\s*["'`](?!CHANGE_ME|\$\{|\s*$)[^"'`\n]{8,}["'`]/,
  /DATABASE_URL\s*=\s*["'`]postgres(?:ql)?:\/\/[^"'`\n]+["'`]/i,
];

function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  const normalized = filePath.replace(/\\/g, "/");
  if (SKIP_PATH_PATTERNS.some((rx) => rx.test(normalized))) {
    return false;
  }
  return ALLOWED_EXT.has(ext) && !SKIP_FILES.has(base);
}

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (shouldScanFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

const violations = [];

for (const target of TARGETS) {
  if (!fs.existsSync(target)) {
    continue;
  }
  for (const filePath of walk(target)) {
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const relative = path.relative(ROOT, filePath).replace(/\\/g, "/");
    for (const pattern of PATTERNS) {
      if (pattern.test(content)) {
        violations.push(relative);
        break;
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Potential secrets detected. Commit blocked.");
  for (const file of [...new Set(violations)]) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}

console.log("Secret scan passed.");
