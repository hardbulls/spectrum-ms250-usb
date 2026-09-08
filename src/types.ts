export type ControllerEvent =
    | { type: 'ball' }
    | { type: 'strike' }
    | { type: 'out' }
    | { type: 'inning'; half: 'top' | 'bottom'; number: number }
    | { type: 'score'; team: 'home' | 'away'; value: number }
    | { type: 'unknown'; bytes: Uint8Array };

export type ScoreboardCommand =
    | { type: 'balls'; count: number }
    | { type: 'strikes'; count: number }
    | { type: 'outs'; count: number }
    | { type: 'inning'; half: 'top' | 'bottom'; number: number }
    | { type: 'score'; team: 'home' | 'away'; value: number };
