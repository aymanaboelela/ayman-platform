import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { VoiceNote, voiceClock, waveformBars } from './voice-note';

const cc = copy.assistant.chat;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('waveformBars', () => {
  it('is the same shape every time for the same note, and a different one for the next', () => {
    const a = waveformBars('/api/assistant/conversations/x/messages/1/attachment');
    expect(waveformBars('/api/assistant/conversations/x/messages/1/attachment')).toEqual(a);
    expect(waveformBars('/api/assistant/conversations/x/messages/2/attachment')).not.toEqual(a);
  });

  it('stays inside the track — never a zero-height or overflowing bar', () => {
    for (const height of waveformBars('seed', 64)) {
      expect(height).toBeGreaterThanOrEqual(0.2);
      expect(height).toBeLessThanOrEqual(1);
    }
  });
});

describe('voiceClock', () => {
  it('prints m:ss in Western digits', () => {
    expect(voiceClock(0)).toBe('0:00');
    expect(voiceClock(7)).toBe('0:07');
    expect(voiceClock(75.9)).toBe('1:15');
  });
});

describe('VoiceNote', () => {
  it('shows the recorder’s own length before anything has loaded', () => {
    render(<VoiceNote src="/api/a" durationSeconds={42} tone="other" />);
    expect(screen.getByText('0:42')).toBeInTheDocument();
    // Nothing fetched until play is pressed — the reason `preload="none"` exists.
    expect(document.querySelector('audio')).toHaveAttribute('preload', 'none');
  });

  it('plays from its own button, and names the button for what it will do', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    render(<VoiceNote src="/api/a" durationSeconds={42} tone="own" />);
    fireEvent.click(screen.getByRole('button', { name: cc.voicePlay }));
    expect(play).toHaveBeenCalled();

    // The element reports it started; the button turns into «pause».
    fireEvent.play(document.querySelector('audio')!);
    expect(screen.getByRole('button', { name: cc.voicePause })).toBeInTheDocument();
  });

  it('seeks from a real, named range input', () => {
    render(<VoiceNote src="/api/a" durationSeconds={40} tone="other" />);
    const seek = screen.getByRole('slider', { name: cc.voiceSeek });
    fireEvent.change(seek, { target: { value: '20' } });
    expect(document.querySelector('audio')!.currentTime).toBe(20);
    // Half way: the first half of the bars are lit.
    const lit = document.querySelectorAll('.chat-voice__bar[data-on="true"]').length;
    const all = document.querySelectorAll('.chat-voice__bar').length;
    expect(lit).toBe(all / 2);
  });
});
