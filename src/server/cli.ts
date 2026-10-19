import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword, MIN_PASSWORD_LENGTH } from './auth/password.ts';
import { databasePath, loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { setPassword, USERNAMES } from './data/users.ts';
import { deleteAllEvents } from './delete-events.ts';
import { importMongo } from './import-mongo.ts';

const USAGE = `Usage: node src/server/cli.ts <command>

Commands:
  passwd <${USERNAMES.join('|')}>   Set a password (asks for it, or reads one line from stdin).
                              Logs that user out everywhere.
  backup <file>               Write a consistent copy of the database, also while the server runs.
  import-mongo <dir>          Import rooms, events and logos exported from the old MongoDB app
                              (rooms.json, events.json, logos.json made with mongoexport).
                              Only into a new, empty database.
  delete-events [--yes]       Delete every event (with its days, bookings and breaks) in one transaction;
                              organizers, logos, rooms, media and settings stay. Without --yes it only
                              says how many would go. Run \`backup\` first.`;

/** Asks on the terminal without echoing what is typed. */
async function askHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = new Promise<string>((resolve) => rl.question(question, resolve));
  muted = true;
  const value = await answer;
  rl.close();
  process.stdout.write('\n');
  return value;
}

async function readStdinLine(): Promise<string> {
  let text = '';
  for await (const chunk of process.stdin) text += String(chunk);
  return text.split(/\r?\n/)[0] ?? '';
}

async function passwd(username: string | undefined): Promise<void> {
  if (!username || !(USERNAMES as readonly string[]).includes(username)) {
    throw new Error(`Specify the user: ${USERNAMES.join(' or ')}`);
  }

  let password: string;
  if (process.stdin.isTTY) {
    password = await askHidden(`New password for ${username}: `);
    if ((await askHidden('Repeat it: ')) !== password) throw new Error('The passwords do not match.');
  } else {
    password = await readStdinLine();
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  const db = openDatabase(databasePath(loadConfig()));
  setPassword(db, username, await hashPassword(password), Date.now());
  db.close();
  console.log(`Password for ${username} updated. Any open sessions were logged out.`);
}

const [command, ...args] = process.argv.slice(2);
try {
  switch (command) {
    case 'passwd':
      await passwd(args[0]);
      break;
    case 'backup': {
      if (!args[0]) throw new Error('Specify the file to write, e.g. /data/backup-2026-10-17.db');
      if (existsSync(args[0])) throw new Error(`${args[0]} already exists.`);
      const db = openDatabase(databasePath(loadConfig()));
      db.prepare('VACUUM INTO ?').run(args[0]);
      db.close();
      console.log(`Database copied to ${args[0]}.`);
      break;
    }
    case 'import-mongo': {
      if (!args[0]) throw new Error('Specify the folder with rooms.json, events.json and logos.json.');
      const db = openDatabase(databasePath(loadConfig()));
      const report = await importMongo(db, args[0], Date.now());
      db.close();
      console.log(`Imported ${report.rooms} rooms, ${report.organizers} organizers, ${report.logos} logos, ${report.events} events.`);
      for (const line of report.skipped) console.log(`  skipped ${line}`);
      break;
    }
    case 'delete-events': {
      const confirmed = args.includes('--yes');
      const db = openDatabase(databasePath(loadConfig()));
      const count = deleteAllEvents(db, confirmed);
      db.close();
      if (confirmed) console.log(`Deleted ${count} events.`);
      else console.log(`${count} events would be deleted. Run \`backup\` first, then repeat with --yes.`);
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
