import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import { parseReceiptText, type ReceiptReading } from './receipt-parse';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OCR إيصال التحويل — الطبقة اللي بتشوف الفلوس مش صورة الفلوس.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ## Why an OCR pass is worth having at all
 *
 * `receipt-fingerprint.ts` compares PICTURES, and on 2026-09-17 that was enough
 * for four of the five duplicate payments — they were byte-identical uploads.
 * The fifth was not: `BK-EA9B7C` carried a Vodafone-Cash SMS and `BK-7A3FD3` an
 * InstaPay receipt, two completely different images of ONE transfer
 * (`023031384189`, 250 EGP). Only the numbers printed on them are the same, and
 * only reading them can tell.
 *
 * The second reason is the one that keeps paying: «تشوف هل هي نفس المبلغ ولا
 * لا». An underpaid order looks exactly like a paid one until somebody opens
 * the screenshot.
 *
 * ## ⚠️ It never blocks, and it never throws
 *
 * Every failure — the engine missing, the language data missing, a timeout, an
 * unreadable photograph — returns `{ ref: null, amountCents: null }`. A student
 * who transferred real money must be able to finish paying while the OCR is
 * having a bad day; `submitPayment` treats nulls as "nothing learned" and
 * carries on. The only thing a reading can do is refuse a receipt whose
 * reference is *already on another order*, which is a fact and not a guess.
 *
 * ## ⚠️ No network, ever
 *
 * `tesseract.js` fetches its `.traineddata` from a CDN by default, which would
 * make a student's checkout depend on unpkg being up. `LANG_PATH` points at the
 * `@tesseract.js-data/*` packages installed beside us instead, so the data is
 * on disk at build time and nothing is downloaded at runtime.
 *
 * ## Why `eng` and not `ara`
 *
 * The fields that matter are Latin digits in both apps — `250.00`,
 * `023031384189` — and they read cleanly. The Arabic labels around them are the
 * least reliable part of the image and `receipt-parse.ts` deliberately does not
 * depend on them: it identifies the numbers by their SHAPE and position. Adding
 * an Arabic pass would triple the time for a hint the parser does not use.
 */

const log = new Logger('ReceiptOcr');

/**
 * Where the `.traineddata` lives. Resolved off the installed data package, so
 * it is correct in the repo, in the Docker image and in a test run without
 * anybody setting anything.
 */
const LANG_PATH = (() => {
  try {
    const entry = require.resolve('@tesseract.js-data/eng/package.json');
    const root = entry.slice(0, entry.lastIndexOf('/'));
    /* ⚠️ NOT the package root. `@tesseract.js-data/*` files the data under a
       TESSERACT-version folder — `4.0.0/eng.traineddata.gz`, beside a
       `4.0.0_best_int/` variant — and `langPath` is a directory that must
       contain `<lang>.traineddata.gz` directly. Pointed at the root it throws
       ENOENT from inside the worker thread, which lands as an uncatchable
       `process.nextTick` rethrow rather than as a failed read.
       `4.0.0` is the fast integer model: a fraction of the size and the time of
       `best_int`, and these are printed digits, not handwriting. */
    const versioned = `${root}/4.0.0`;
    return existsSync(`${versioned}/eng.traineddata.gz`) ? versioned : root;
  } catch {
    return null;
  }
})();

/** Long enough for a slow cold start on a small VPS, short enough that a stuck
 *  worker never becomes a checkout that hangs. */
const OCR_TIMEOUT_MS = 20_000;

/**
 * The worker is created ONCE and reused.
 *
 * Spinning one up costs a second or two of WASM instantiation, and a book
 * payment is not rare enough to pay that every time. Held as the promise rather
 * than the resolved worker so two simultaneous payments share one start-up
 * instead of racing into two.
 */
let workerPromise: Promise<OcrWorker | null> | null = null;

/** Only the part of the `tesseract.js` surface this file uses. */
type OcrWorker = {
  recognize: (image: Buffer) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

async function getWorker(): Promise<OcrWorker | null> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    if (!LANG_PATH) {
      log.warn('tesseract language data is not installed — receipts will not be read');
      return null;
    }
    try {
      const { createWorker } = (await import('tesseract.js')) as {
        createWorker: (lang: string, oem?: number, options?: Record<string, unknown>) => Promise<OcrWorker>;
      };
      return await createWorker('eng', undefined, {
        langPath: LANG_PATH,
        gzip: true,
        /* ⚠️ Where the DECOMPRESSED `.traineddata` lands, and the default is the
           process's working directory. Left alone, the first book payment after
           a deploy writes a 22 MB `eng.traineddata` into the API's CWD — which
           is the repo root in development (it appeared as an untracked file the
           first time this ran) and the app directory in the container, where
           the filesystem may well be read-only. The OS temp directory is the
           only place a server may assume it can write. */
        cachePath: tmpdir(),
        /* ⚠️ A no-op function, never `undefined`. `createWorker` only checks
           whether the key is PRESENT before calling it, so passing `undefined`
           explicitly crashes the worker thread with «logger is not a function»
           — an uncatchable `process.nextTick` throw that takes the API down
           rather than degrading to "no reading". Left out entirely it would
           print a progress line per percent per image. */
        logger: () => undefined,
      });
    } catch (error) {
      log.warn(`tesseract.js unavailable — receipts will not be read: ${String(error)}`);
      return null;
    }
  })();
  return workerPromise;
}

/**
 * Read one receipt image.
 *
 * Returns nulls rather than throwing, always — see the header.
 */
export async function readReceipt(bytes: Buffer): Promise<ReceiptReading> {
  const nothing: ReceiptReading = { ref: null, amountCents: null };

  const worker = await getWorker();
  if (!worker) return nothing;

  let prepared: Buffer;
  try {
    prepared = await prepare(bytes);
  } catch {
    return nothing;
  }

  try {
    const result = await withTimeout(worker.recognize(prepared), OCR_TIMEOUT_MS);
    return parseReceiptText(result.data.text);
  } catch (error) {
    log.warn(`could not read a receipt: ${String(error)}`);
    return nothing;
  }
}

/**
 * Prepare the image for the engine.
 *
 * Both receipt styles are phone screenshots, and one of them is WHITE TEXT ON A
 * DARK BACKGROUND — a Vodafone-Cash SMS in the phone's dark theme. Tesseract is
 * trained on dark-on-light and reads the inverse very badly, so the page is
 * normalised: greyscale, then inverted when it is mostly dark, then upscaled,
 * because the digits in a 1080-wide screenshot are smaller than the engine
 * likes.
 */
async function prepare(bytes: Buffer): Promise<Buffer> {
  const image = sharp(bytes).greyscale();
  const stats = await image.stats();
  const meanBrightness = stats.channels[0]?.mean ?? 255;

  let pipeline = sharp(bytes).greyscale();
  if (meanBrightness < 110) pipeline = pipeline.negate();

  const metadata = await sharp(bytes).metadata();
  const width = metadata.width ?? 0;
  if (width > 0 && width < 1400) pipeline = pipeline.resize({ width: Math.round(width * 1.8) });

  /* `normalise` stretches the histogram, which is what makes a washed-out
     re-compressed screenshot legible. PNG out because a second lossy pass over
     text is exactly what the engine does not need. */
  return pipeline.normalise().png().toBuffer();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OCR timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** For tests and for a clean shutdown — the worker holds a WASM instance. */
export async function stopReceiptOcr(): Promise<void> {
  const worker = await workerPromise?.catch(() => null);
  workerPromise = null;
  await worker?.terminate().catch(() => undefined);
}
