import type { ScoreboardProtocol } from '../ScoreboardProtocol.js';
import type { ControllerEvent, ScoreboardCommand } from '../types.js';

/**
 * Placeholder implementation for the MS-250.
 *
 * The real MS-250 serial protocol hasn't been reverse-engineered yet, so
 * this uses a made-up, length-prefixed frame format: [tag byte] [length byte]
 * [payload...]. Swap this out once the real protocol is known.
 *
 * Baud rate/framing are also unconfirmed. No documentation for the MS-250
 * itself was found; 9600 8N1 is the most common default for this class of
 * device and is a reasonable first guess to try with the sniffer tool.
 */

const enum Tag {
    Balls = 0x01,
    Strikes = 0x02,
    Outs = 0x03,
    Inning = 0x04,
    Score = 0x05,
}

export class MS250ScoreboardProtocol implements ScoreboardProtocol {
    private buffer: number[] = [];

    decode(bytes: Uint8Array): ControllerEvent[] {
        this.buffer.push(...bytes);

        const events: ControllerEvent[] = [];
        let frame: number[] | undefined;
        while ((frame = this.takeFrame()) !== undefined) {
            events.push(decodeFrame(frame));
        }

        return events;
    }

    encode(command: ScoreboardCommand): Uint8Array {
        switch (command.type) {
            case 'balls':
                return frame(Tag.Balls, command.count);
            case 'strikes':
                return frame(Tag.Strikes, command.count);
            case 'outs':
                return frame(Tag.Outs, command.count);
            case 'inning':
                return frame(Tag.Inning, command.half === 'bottom' ? 1 : 0, command.number);
            case 'score':
                return frame(Tag.Score, command.team === 'home' ? 1 : 0, command.value);
        }
    }

    private takeFrame(): number[] | undefined {
        if (this.buffer.length < 2) return undefined;

        const length = this.buffer[1];
        if (length === undefined || this.buffer.length < 2 + length) return undefined;

        const frame = this.buffer.slice(0, 2 + length);
        this.buffer = this.buffer.slice(2 + length);

        return frame;
    }
}

function decodeFrame(frame: number[]): ControllerEvent {
    const [tag, , ...payload] = frame;

    switch (tag) {
        case Tag.Balls:
            return { type: 'ball' };
        case Tag.Strikes:
            return { type: 'strike' };
        case Tag.Outs:
            return { type: 'out' };
        case Tag.Inning:
            return { type: 'inning', half: payload[0] === 1 ? 'bottom' : 'top', number: payload[1] ?? 0 };
        case Tag.Score:
            return { type: 'score', team: payload[0] === 1 ? 'home' : 'away', value: payload[1] ?? 0 };
        default:
            return { type: 'unknown', bytes: Uint8Array.from(frame) };
    }
}

function frame(tag: number, ...payload: number[]): Uint8Array {
    return Uint8Array.from([tag, payload.length, ...payload]);
}
