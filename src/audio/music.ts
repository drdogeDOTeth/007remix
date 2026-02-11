/**
 * Infinite Spy Theme - Procedural background music system
 *
 * Thin wrapper around the infinitethemeloops implementation.
 * The music evolves over time with procedural variations while maintaining
 * the core spy-thriller feel.
 */

import * as infiniteTheme from './infinitethemeloops';

export const startMusic = infiniteTheme.startMusic;
export const stopMusic = infiniteTheme.stopMusic;
export const setMusicVolume = infiniteTheme.setMusicVolume;
export const isMusicPlaying = infiniteTheme.isMusicPlaying;
