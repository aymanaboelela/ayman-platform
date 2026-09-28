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
