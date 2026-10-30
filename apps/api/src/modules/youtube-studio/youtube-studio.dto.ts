import { YoutubeSuggestRequestSchema, YoutubeVideoUpdateSchema } from '@ayman/contracts/youtube/studio';
import { createZodDto } from 'nestjs-zod';

export class YoutubeVideoUpdateDto extends createZodDto(YoutubeVideoUpdateSchema) {}
export class YoutubeSuggestRequestDto extends createZodDto(YoutubeSuggestRequestSchema) {}
