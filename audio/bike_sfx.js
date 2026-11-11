/**
 * bike_sfx.js — Clean alias re-exporting unified `GameAudioEngine` (`VETO-AUDIO-02`).
 * Zero legacy <5ms envelopes and zero duplicate `window.__audioStreamDestination` mutations.
 */
export { GameAudioEngine, GameAudioEngine as BikeSfxEngine } from "./game_audio.js";
export { GameAudioEngine as default } from "./game_audio.js";
