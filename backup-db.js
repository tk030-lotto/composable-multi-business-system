const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Ensure the path is correct relative to where the script is run
// In Next.js with Prisma, the sqlite db is usually at prisma/dev.db if we use file:./dev.db in .env
// Wait, in src/lib/prisma.ts it uses file:./dev.db, so we do the same
const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

const BACKUP_DIR = path.join(__dirname, 'backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// Helper to format Date to YYYYMMDD-HHMMSS
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// Convert string dates back to Date objects for Prisma
function parseDates(items, dateFields) {
  return items.map((item) => {
    const newItem = { ...item };
    for (const field of dateFields) {
      if (newItem[field]) {
        newItem[field] = new Date(newItem[field]);
      }
    }
    return newItem;
  });
}

// Convert JSON array to CSV string
function toCSV(data) {
  if (!data || data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => {
    return headers
      .map((header) => {
        let val = row[header];
        if (val === null || val === undefined) val = '';
        if (val instanceof Date) val = val.toISOString();
        if (typeof val === 'string') {
          // Escape quotes
          val = val.replace(/"/g, '""');
          // Wrap in quotes if it contains comma, newline or quotes
          if (val.includes(',') || val.includes('\n') || val.includes('"')) {
            val = `"${val}"`;
          }
        }
        return val;
      })
      .join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

async function doBackup(format) {
  console.log('Fetching data from database...');
  const accounts = await prisma.account.findMany();
  const journalEntries = await prisma.journalEntry.findMany();
  const auditLogs = await prisma.auditLog.findMany();

  ensureBackupDir();
  const timestamp = getTimestamp();

  if (format === 'csv') {
    const accountsCsv = toCSV(accounts);
    const journalsCsv = toCSV(journalEntries);
    const logsCsv = toCSV(auditLogs);

    const accountsPath = path.join(BACKUP_DIR, `accounts-${timestamp}.csv`);
    const journalsPath = path.join(BACKUP_DIR, `journal_entries-${timestamp}.csv`);
    const logsPath = path.join(BACKUP_DIR, `audit_logs-${timestamp}.csv`);

    fs.writeFileSync(accountsPath, accountsCsv);
    fs.writeFileSync(journalsPath, journalsCsv);
    fs.writeFileSync(logsPath, logsCsv);
    console.log(`Backup completed (CSV format):`);
    console.log(`- ${accountsPath}`);
    console.log(`- ${journalsPath}`);
    console.log(`- ${logsPath}`);
  } else {
    // Default to JSON
    const backupData = {
      accounts,
      journal_entries: journalEntries,
      audit_logs: auditLogs,
    };
    const filePath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
    console.log(`Backup completed (JSON format): ${filePath}`);
  }
}

// --file が指定されなかった場合、backups/ 内の最新の JSON バックアップを自動選択する
function findLatestJsonBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const jsonFiles = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
    .sort();
  if (jsonFiles.length === 0) return null;
  return path.join(BACKUP_DIR, jsonFiles[jsonFiles.length - 1]);
}

async function doRestore(filename, force) {
  if (!filename) {
    filename = findLatestJsonBackup();
    if (!filename) {
      console.error(
        'Error: backups/ 内にJSONバックアップが見つかりません。--file <filename> で指定してください。'
      );
      process.exit(1);
    }
    console.log(`--file 未指定のため、最新のバックアップを使用します: ${filename}`);
  } else if (!fs.existsSync(filename) && fs.existsSync(path.join(BACKUP_DIR, filename))) {
    // backups/ 内のファイル名のみが渡された場合はそこから解決する
    filename = path.join(BACKUP_DIR, filename);
  }

  if (!fs.existsSync(filename)) {
    console.error(`Error: File not found: ${filename}`);
    process.exit(1);
  }

  if (!force) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      rl.question(
        'WARNING: This will completely replace the current database with the backup data. All existing data will be lost. Are you sure? (y/N): ',
        resolve
      );
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Restore aborted.');
      process.exit(0);
    }
  }

  console.log(`Reading backup file: ${filename}...`);
  const rawData = fs.readFileSync(filename, 'utf8');
  let data;
  try {
    data = JSON.parse(rawData);
  } catch (e) {
    console.error('Error: Invalid JSON format. Restore only supports JSON backups.');
    process.exit(1);
  }

  // Parse dates
  const accounts = parseDates(data.accounts || [], ['created_at', 'updated_at', 'deleted_at']);
  const journalEntries = parseDates(data.journal_entries || [], [
    'date',
    'created_at',
    'updated_at',
    'deleted_at',
  ]);
  const auditLogs = parseDates(data.audit_logs || [], ['created_at']);

  console.log('Temporarily dropping audit triggers...');
  const triggers = [
    'trigger_audit_account_insert',
    'trigger_audit_account_update',
    'trigger_audit_account_delete',
    'trigger_audit_journal_entry_insert',
    'trigger_audit_journal_entry_update',
    'trigger_audit_journal_entry_delete',
  ];
  for (const trigger of triggers) {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger}`);
  }

  console.log('Clearing existing data...');
  // Delete in order to respect FK constraints if any
  await prisma.journalEntry.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.auditLog.deleteMany({});

  console.log('Restoring data...');
  if (accounts.length > 0) {
    await prisma.account.createMany({ data: accounts });
    console.log(`- Restored ${accounts.length} accounts.`);
  }
  if (journalEntries.length > 0) {
    await prisma.journalEntry.createMany({ data: journalEntries });
    console.log(`- Restored ${journalEntries.length} journal entries.`);
  }
  if (auditLogs.length > 0) {
    await prisma.auditLog.createMany({ data: auditLogs });
    console.log(`- Restored ${auditLogs.length} audit logs.`);
  }

  console.log('Rebuilding audit triggers...');
  const schemaSqlPath = path.join(__dirname, 'prisma', 'schema.sql');
  if (fs.existsSync(schemaSqlPath)) {
    const { execSync } = require('child_process');
    try {
      execSync('npx prisma db execute --file prisma/schema.sql', { stdio: 'inherit' });
      console.log('Audit triggers rebuilt successfully.');
    } catch (e) {
      console.error('Error rebuilding audit triggers:', e.message);
    }
  } else {
    console.error(`Warning: ${schemaSqlPath} not found. Audit triggers were not rebuilt!`);
  }

  console.log('Restore completed successfully.');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || (command !== 'backup' && command !== 'restore')) {
    console.log('Usage:');
    console.log('  node backup-db.js backup [--format json|csv]');
    console.log('  node backup-db.js restore --file <filename> [--force]');
    process.exit(1);
  }

  let format = 'json';
  let file = null;
  let force = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--file' && args[i + 1]) {
      file = args[i + 1];
      i++;
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  try {
    if (command === 'backup') {
      await doBackup(format);
    } else if (command === 'restore') {
      await doRestore(file, force);
    }
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
