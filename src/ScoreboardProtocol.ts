import type { ControllerEvent, ScoreboardCommand } from './types.js';

export interface ScoreboardProtocol {
    decode(bytes: Uint8Array): ControllerEvent[];

    encode(command: ScoreboardCommand): Uint8Array;
}
