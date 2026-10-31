import { IS_AYMAN } from '../../common/tenant';

/**
 * مفتاح Azure من البيئة، أو `null`. بيتقري من `process.env` على طول مش من
 * `loadEnv`: الاسكيما اتفحصت مرة وقت الـboot، وتقريها تاني هنا كان هيوقّع
 * أي تست مالوش بيئة كاملة. الفاضي = مش متظبّط (`${VAR:-}` في docker-compose).
 */
export function azureSpeech(): { key: string; region: string } | null {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  return key && region ? { key, region } : null;
}

/**
 * Whether this stack plays the pre-recorded Millionaire library
 * (`game-voice/library/*` in media storage, written by
 * `scripts/record-game-voice.ts`). Ayman's stack only: the clips are his own
 * voice, and his voice on another teacher's game is his name on their page
 * (CLAUDE.md §2). `GAME_VOICE_LIBRARY=off` switches it off without a rebuild.
 *
 * A question with no recording is a 404, and the player falls back to the
 * browser's voice for that question — so a half-recorded bank is fine.
 */
export function voiceLibrary(): boolean {
  return IS_AYMAN && process.env.GAME_VOICE_LIBRARY?.trim() !== 'off';
}
