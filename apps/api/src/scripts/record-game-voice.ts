/**
 * Records the Millionaire voice library offline, in his cloned voice, into a
 * folder laid out exactly like media storage (`game-voice/library/<hash>.mp3`).
 * The folder is then copied onto the server's media volume and kept on his Mac
 * as the backup. Nothing on the server calls the vendor: once a clip is
 * recorded it is our file (`GameVoiceService` reads the library first).
 *
 *   ELEVENLABS_API_KEY=… pnpm --filter @ayman/api exec tsx src/scripts/record-game-voice.ts \
 *     --questions questions.json --out ~/ayman-game-voice --voice <voiceId> [--budget 30000] [--spoken spoken.json]
 *
 * `questions.json`: `[{ id, stem, options: [{ id, body }] }]` — the live
 * question versions (`stem`/`body` are the stored HTML).
 * `spoken.json` (optional): `{ "<screen text>": "<what to say>" }` — the
 * Egyptian rewording of an Arabic question. The key stays the SCREEN text
 * (`libraryKey`), so the server finds the clip without knowing the rewording.
 *
 * Re-runnable: a clip already in `--out` is skipped, so a run that hits the
 * credit budget picks up where it stopped next month.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { INTROS, LETTERS, LETTERS_EN, LETTER_NAMES, LETTER_NAMES_EN, libraryKey, textOf } from '../modules/quiz/game-voice.text';

interface Question {
  id: string;
  stem: string;
  options: Array<{ id: string; body: string }> | null;
}

interface Job {
  /** What the server will look up — the screen text. */
  text: string;
  /** What the voice says. */
  spoken: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Screen text → something a voice reads cleanly. `textOf` leaves a space where
 * a tag was («HTTPS ?»), and an option with no full stop runs straight into
 * the next letter.
 */
function speakable(text: string): string {
  const tidy = text
    .replace(/\s+([?.!,:;؟،])/g, '$1')
    .replace(/→/g, /[؀-ۿ]/.test(text) ? ' ثم ' : ' then ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[.?!؟…]$/.test(tidy) ? tidy : `${tidy}.`;
}

async function main(): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const questionsPath = arg('questions');
  const out = arg('out');
  const voice = arg('voice');
  if (!apiKey || !questionsPath || !out || !voice) {
    throw new Error('needs ELEVENLABS_API_KEY, --questions, --out and --voice');
  }
  const budget = Number(arg('budget') ?? Infinity);
  const spokenPath = arg('spoken');
  const spoken: Record<string, string> = spokenPath ? JSON.parse(readFileSync(spokenPath, 'utf8')) : {};
  const questions: Question[] = JSON.parse(readFileSync(questionsPath, 'utf8'));

  const jobs = new Map<string, Job>();
  const add = (text: string, say?: string) => {
    if (!text || jobs.has(text)) return;
    jobs.set(text, { text, spoken: spoken[text] ?? say ?? speakable(text) });
  };
  // The intros and letters first: fifteen and six clips every round plays.
  INTROS.forEach((line) => add(line, line));
  LETTERS.forEach((letter, i) => add(letter, LETTER_NAMES[i]));
  LETTERS_EN.forEach((letter, i) => add(letter, LETTER_NAMES_EN[i]));
  for (const question of questions) {
    add(textOf(question.stem));
    for (const option of question.options ?? []) add(textOf(option.body));
  }

  let spent = 0;
  let recorded = 0;
  let skipped = 0;
  for (const job of jobs.values()) {
    const path = join(out, libraryKey(job.text));
    if (existsSync(path)) {
      skipped += 1;
      continue;
    }
    // One credit per character on this model — stop BEFORE the budget, not after.
    if (spent + job.spoken.length > budget) break;
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: job.spoken,
          model_id: 'eleven_v4',
          voice_settings: { stability: 0.5, similarity_boost: 0.9 },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      // Out of credits or rate-limited: stop and keep what is recorded.
      console.error(`stopped: ${response.status} ${(await response.text()).slice(0, 200)}`);
      break;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
    spent += job.spoken.length;
    recorded += 1;
    if (recorded % 25 === 0) console.log(`${recorded} recorded, ~${spent} credits`);
  }
  const left = jobs.size - recorded - skipped;
  console.log(`done: ${recorded} recorded (~${spent} credits), ${skipped} already there, ${left} left`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
