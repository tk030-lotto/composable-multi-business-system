const fs = require('fs');
const path = require('path');

// 検査対象ディレクトリ
const TARGET_DIR = path.join(__dirname, 'src');

// 行単位の正規表現チェック（単純な単一行パターン）
const FORBIDDEN_LINE_PATTERNS = [
  // 外部への fetch (localhost, 127.0.0.1、および相対パス / は除外)
  /fetch\(\s*['"`]https?:\/\/(?!localhost|127\.0\.0\.1)/,
  // axios やその他通信ライブラリの利用
  /['"`]axios['"`]/,
  /axios\./,
  // XMLHttpRequest
  /new\s+XMLHttpRequest\(\)/,
  // WebSocket (外部URLリテラル)
  /new\s+WebSocket\(\s*['"`]wss?:\/\/(?!localhost|127\.0\.0\.1)/,
  // WebSocket (変数など静的に安全と判断できない引数)
  /new\s+WebSocket\(\s*(?!['"`])/,
  // Node の通信系コアモジュールの読み込み（require）
  /require\(\s*['"`](https?|http2|net|dgram|dns|tls)['"`]\s*\)/,
];

// ファイル全体（複数行）に対して評価する正規表現チェック
const FORBIDDEN_WHOLE_FILE_PATTERNS = [
  // Node の通信系コアモジュールの読み込み（import）
  /import\s+[^;]*\s+from\s+['"`](https?|http2|net|dgram|dns|tls)['"`]/g,
  // fetch() に文字列リテラル以外（変数・式・テンプレートの式展開始まり）が渡されているケース
  // → 静的解析では宛先を判定できないため、要確認としてブロックする
  /fetch\(\s*(?!['"`]\/)(?!['"`]https?:\/\/(?:localhost|127\.0\.0\.1))[^)]/g,
];

function scanDirectory(dir) {
  let hasViolation = false;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      hasViolation = scanDirectory(fullPath) || hasViolation;
    } else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(file)) {
      hasViolation = scanFile(fullPath) || hasViolation;
    }
  }

  return hasViolation;
}

function scanFile(fullPath) {
  let hasViolation = false;
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FORBIDDEN_LINE_PATTERNS) {
      if (pattern.test(line)) {
        report(fullPath, i + 1, line);
        hasViolation = true;
      }
    }
  }

  for (const pattern of FORBIDDEN_WHOLE_FILE_PATTERNS) {
    // pattern はループ間で lastIndex を共有する global regex なので、ファイルごとにリセットする
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = content.slice(0, match.index).split('\n').length;
      report(fullPath, lineNumber, lines[lineNumber - 1]);
      hasViolation = true;
    }
  }

  return hasViolation;
}

function report(fullPath, lineNumber, line) {
  console.error(`[VIOLATION] Forbidden network communication found!`);
  console.error(`  File: ${fullPath}:${lineNumber}`);
  console.error(`  Code: ${line.trim()}`);
}

console.log('Scanning for external network communications in src/ ...');

if (!fs.existsSync(TARGET_DIR)) {
  console.log(`Directory not found: ${TARGET_DIR}. Skipping scan.`);
  process.exit(0);
}

const isViolationFound = scanDirectory(TARGET_DIR);

if (isViolationFound) {
  console.error('\nERROR: External network communication detected. Build aborted (V3 isolation requirement).');
  process.exit(1);
} else {
  console.log('\nSUCCESS: No external network communication detected. V3 isolation check passed.');
  process.exit(0);
}
