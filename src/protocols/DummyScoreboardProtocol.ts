import type { ScoreboardProtocol } from '../ScoreboardProtocol.js';
import type { ControllerEvent, ScoreboardCommand } from '../types.js';

export class DummyScoreboardProtocol implements ScoreboardProtocol {
    decode(bytes: Uint8Array): ControllerEvent[] {
        return [{ type: 'unknown', bytes }];
    }

    encode(command: ScoreboardCommand): Uint8Array {
        throw new Error(`MS-250 protocol not implemented yet, cannot encode command: ${command.type}`);
    }
}
