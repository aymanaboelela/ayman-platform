import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import { PrismaService } from '../../prisma/prisma.service';
import { GameService } from './game.service';
import { azureSpeech } from './game-voice.config';

/** «شاكر» — صوت Azure المصري. مذيع مسابقات، مش قارئ نشرة. */
const VOICE = 'ar-EG-ShakirNeural';
const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

/** نص من HTML السؤال — لازم يبقى نظيف قبل ما يدخل SSML. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]!);
}

/**
 * صوت «من سيربح المليون» — قطع صغيرة بتتسجّل مرة وتتحفظ:
 *
 *   · `stem`        — نص السؤال.
 *   · `<optionId>`  — نص الاختيار.
 *   · `letter-<n>`  — «أ»، «ب»… لوحدها.
 *
 * الاختيارات بتتلخبط كل جولة (`GameService.round`)، فالحرف مايتسجّلش مع
 * الاختيار — المتصفح بيشغّل «حرف مكانه» + «نص الاختيار»، فالقراية دايمًا
 * مطابقة للي على الشاشة.
 *
 * التسجيل بيتحفظ في نفس تخزين الميديا بمفتاح = hash(الصوت + النص). أول طالب
 * يوصل للسؤال بيدفع تمن التسجيل (حروف من الـ٥٠٠ ألف المجانية في الشهر)، وكل
 * اللي بعده بياخده من التخزين. تعديل السؤال = نص جديد = مفتاح جديد.
 */
@Injectable()
export class GameVoiceService {
  private readonly logger = new Logger(GameVoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  async clip(userId: string, questionId: string, part: string): Promise<Readable> {
    const azure = azureSpeech();
    if (!azure) throw new NotFoundException();

    let text: string;
    const letter = /^letter-(\d)$/.exec(part);
    if (letter) {
      text = LETTERS[Number(letter[1])] ?? '';
    } else {
      await this.game.assertInPool(userId, questionId);
      if (part === 'stem') {
        const version = await this.prisma.questionVersion.findUnique({
          where: { id: questionId },
          select: { stemHtml: true },
        });
        text = textOf(version?.stemHtml ?? '');
      } else {
        const option = await this.prisma.questionOption.findFirst({
          where: { id: part, questionVersionId: questionId },
          select: { bodyHtml: true },
        });
        text = textOf(option?.bodyHtml ?? '');
      }
    }
    if (!text) throw new NotFoundException();

    const key = `game-voice/${createHash('sha256').update(`${VOICE}|${text}`).digest('hex')}.mp3`;
    if (await this.storage.stat(key)) return this.storage.getStream(key);

    const audio = await this.synthesize(azure, text);
    // سباق بين طالبين على نفس السؤال: التاني بيلاقي الملف موجود — مش غلط.
    await this.storage.put(key, audio, 'audio/mpeg').catch(() => undefined);
    return Readable.from(audio);
  }

  private async synthesize(azure: { key: string; region: string }, text: string): Promise<Buffer> {
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-EG">` +
      `<voice name="${VOICE}"><prosody rate="-4%">${escapeXml(text)}</prosody></voice></speak>`;
    const response = await fetch(`https://${azure.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': azure.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'ayman-platform',
      },
      body: ssml,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // الكود بس، مش المفتاح ولا الرد كله.
      this.logger.warn(`azure speech answered ${response.status}`);
      throw new ServiceUnavailableException();
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
