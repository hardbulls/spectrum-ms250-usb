// Interactive CLI to test the MS-250 protocol against a real USB serial connection.
//
// The library itself never touches the serial port (it works the same in Node or the browser)
// — this example wires it up to a real Node serial connection so you can test it against actual
// hardware. No serial npm package needed: on Linux/macOS a serial port is just a character
// device file, so plain fs read/write works; `stty` (a system tool, not an npm dependency)
// configures the baud rate/line mode before we open it.
//
// Run with: npm run example

import { execSync } from 'node:child_process';
import { createReadStream, createWriteStream, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { MS250ScoreboardProtocol } from '../src/index.js';
import type { ScoreboardCommand } from '../src/index.js';

const rl = createInterface({ input: stdin, output: stdout });

async function ask(question: string): Promise<string> {
    return (await rl.question(question)).trim();
}

function listSerialPorts(): string[] {
    const prefixes = ['ttyUSB', 'ttyACM', 'ttyS'];
    try {
        return readdirSync('/dev')
            .filter((f) => prefixes.some((p) => f.startsWith(p)))
            .map((f) => `/dev/${f}`)
            .sort();
    } catch {
        return [];
    }
}

async function pickPort(): Promise<string> {
    const ports = listSerialPorts();
    if (ports.length === 0) {
        console.log('No /dev/ttyUSB*, /dev/ttyACM*, or /dev/ttyS* devices found.');
    } else {
        console.log('Detected serial ports:');
        ports.forEach((p, i) => console.log(`  ${i + 1}) ${p}`));
    }
    const answer = await ask('Port number, or type a device path: ');
    const index = Number.parseInt(answer, 10);
    const picked = !Number.isNaN(index) ? ports[index - 1] : undefined;
    return picked ?? answer;
}

function configurePort(port: string, baud: string): void {
    // raw: no line-discipline processing (no CR/LF translation, no signal chars) — just bytes.
    execSync(`stty -F ${port} ${baud} raw -echo -echoe -echok`);
}

function explainOpenError(err: NodeJS.ErrnoException, port: string): void {
    console.error(`\nFailed to open ${port}: ${err.message}`);
    if (err.code === 'EACCES') {
        console.error("Permission denied — you may need to add your user to the 'dialout' group:");
        console.error('  sudo usermod -a -G dialout $USER   (then log out and back in)');
    }
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
}

async function runInput(): Promise<void> {
    const port = await pickPort();
    const baud = (await ask('Baud rate [9600]: ')) || '9600';
    configurePort(port, baud);

    const protocol = new MS250ScoreboardProtocol();
    console.log(`\nListening on ${port} @ ${baud} baud. Press Ctrl+C to stop.\n`);

    await new Promise<void>((resolvePromise) => {
        const stream = createReadStream(port);
        stream.on('data', (chunk: Buffer) => {
            console.log(`[${new Date().toISOString()}] raw: ${toHex(chunk)}`);
            for (const event of protocol.decode(chunk)) {
                console.log('  →', event);
            }
        });
        stream.on('error', (err: NodeJS.ErrnoException) => {
            explainOpenError(err, port);
            resolvePromise();
        });
        // Never resolves on its own — the process exits via Ctrl+C (SIGINT).
    });
}

type CommandBuilder = { label: string; build: () => Promise<ScoreboardCommand> };

const COMMAND_BUILDERS: CommandBuilder[] = [
    {
        label: 'Balls',
        build: async () => ({ type: 'balls', count: Number.parseInt((await ask('Count: ')) || '0', 10) }),
    },
    {
        label: 'Strikes',
        build: async () => ({ type: 'strikes', count: Number.parseInt((await ask('Count: ')) || '0', 10) }),
    },
    {
        label: 'Outs',
        build: async () => ({ type: 'outs', count: Number.parseInt((await ask('Count: ')) || '0', 10) }),
    },
    {
        label: 'Inning',
        build: async () => {
            const half = (await ask('Half — (t)op or (b)ottom [t]: ')).toLowerCase().startsWith('b') ? 'bottom' : 'top';
            const number = Number.parseInt((await ask('Inning number: ')) || '1', 10);
            return { type: 'inning', half, number };
        },
    },
    {
        label: 'Score',
        build: async () => {
            const team = (await ask('Team — (h)ome or (a)way [h]: ')).toLowerCase().startsWith('a') ? 'away' : 'home';
            const value = Number.parseInt((await ask('Value: ')) || '0', 10);
            return { type: 'score', team, value };
        },
    },
];

async function runOutput(): Promise<void> {
    const port = await pickPort();
    const baud = (await ask('Baud rate [9600]: ')) || '9600';
    configurePort(port, baud);

    const protocol = new MS250ScoreboardProtocol();
    const stream = createWriteStream(port);
    try {
        await new Promise<void>((resolvePromise, rejectPromise) => {
            stream.once('open', () => resolvePromise());
            stream.once('error', rejectPromise);
        });
    } catch (err) {
        explainOpenError(err as NodeJS.ErrnoException, port);
        return;
    }

    console.log(`\nConnected to ${port} @ ${baud} baud.\n`);

    for (;;) {
        console.log('Commands:');
        COMMAND_BUILDERS.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
        console.log('  q) quit');
        const answer = await ask('Send which? ');
        if (answer.toLowerCase() === 'q') break;

        const builder = COMMAND_BUILDERS[Number.parseInt(answer, 10) - 1];
        if (!builder) {
            console.log('Unknown choice.\n');
            continue;
        }

        const command = await builder.build();
        const bytes = protocol.encode(command);
        stream.write(bytes);
        console.log(`Sent: ${JSON.stringify(command)}  →  ${toHex(bytes)}\n`);
    }
    stream.end();
}

async function main(): Promise<void> {
    console.log('MS-250 serial test CLI\n');
    const mode = (await ask('Mode — (i)nput or (o)utput? ')).toLowerCase();
    if (mode.startsWith('i')) {
        await runInput();
    } else if (mode.startsWith('o')) {
        await runOutput();
    } else {
        console.log("Unknown mode — type 'i' or 'o'.");
    }
    rl.close();
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
