import {
  HeartbeatResponseSchema,
  LessonProgressSchema,
  type HeartbeatResponse,
  type LessonProgressDto,
} from '@ayman/contracts/progress';
import { apiPost } from './api';

export function postOpen(lessonId: string): Promise<LessonProgressDto> {
  return apiPost(`/api/lessons/${lessonId}/open`, LessonProgressSchema, {});
}

/**
 * `position` is where the scrubber is; `delta` is how many seconds of actual
 * playback happened since the last call. The server intersects `delta` with
 * its own measured wall clock, so an inflated value buys nothing — the client
 * simply reports honestly and lets the server be the authority.
 */
export function postHeartbeat(
  lessonId: string,
  body: { position: number; delta: number },
  init?: { keepalive?: boolean },
): Promise<HeartbeatResponse> {
  return apiPost(`/api/lessons/${lessonId}/heartbeat`, HeartbeatResponseSchema, body, init);
}

/** No payload: the 5000ms is measured server-side from the open. */
export function postDwell(lessonId: string): Promise<HeartbeatResponse> {
  return apiPost(`/api/lessons/${lessonId}/dwell`, HeartbeatResponseSchema, {});
}

/** "أنهيت الدرس · التالي". Also no payload — the manual-complete DTO is empty and strict. */
export function postComplete(lessonId: string): Promise<HeartbeatResponse> {
  return apiPost(`/api/lessons/${lessonId}/complete`, HeartbeatResponseSchema, {});
}
