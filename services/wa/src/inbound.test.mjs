import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inboundPhone, inboundText } from './inbound.mjs';

describe('inboundPhone', () => {
  it('reads a phone-number chat as before', async () => {
    assert.equal(await inboundPhone({ remoteJid: '201001234567@s.whatsapp.net' }), '+201001234567');
  });

  it('reads a LID chat through remoteJidAlt — the case the old filter dropped', async () => {
    const key = { remoteJid: '123456789012345@lid', remoteJidAlt: '201001234567@s.whatsapp.net' };
    assert.equal(await inboundPhone(key), '+201001234567');
  });

  it('falls back to the library mapping when the server sent no alt', async () => {
    const key = { remoteJid: '123456789012345@lid' };
    const lookup = async (lid) => (lid === '123456789012345@lid' ? '201001234567:3@s.whatsapp.net' : null);
    assert.equal(await inboundPhone(key, lookup), '+201001234567');
  });

  it('an unknown LID is null, not a guess', async () => {
    assert.equal(await inboundPhone({ remoteJid: '1@lid' }, async () => null), null);
    assert.equal(await inboundPhone({ remoteJid: '1@lid' }), null);
  });

  it('a mapping store that throws is "unknown", not a crash', async () => {
    const lookup = async () => {
      throw new Error('db');
    };
    assert.equal(await inboundPhone({ remoteJid: '1@lid' }, lookup), null);
  });

  it('never our own echoes, groups or broadcasts', async () => {
    assert.equal(await inboundPhone({ remoteJid: '201001234567@s.whatsapp.net', fromMe: true }), null);
    assert.equal(await inboundPhone({ remoteJid: '120363000000000000@g.us' }), null);
    assert.equal(await inboundPhone({ remoteJid: 'status@broadcast' }), null);
    assert.equal(await inboundPhone(null), null);
  });
});

describe('inboundText', () => {
  it('plain and extended text', () => {
    assert.equal(inboundText({ conversation: 'قف' }), 'قف');
    assert.equal(inboundText({ extendedTextMessage: { text: 'قف' } }), 'قف');
  });

  it('looks inside disappearing-message and view-once wrappers', () => {
    assert.equal(inboundText({ ephemeralMessage: { message: { conversation: 'قف' } } }), 'قف');
    assert.equal(
      inboundText({ ephemeralMessage: { message: { extendedTextMessage: { text: 'قف' } } } }),
      'قف',
    );
    assert.equal(inboundText({ viewOnceMessageV2: { message: { imageMessage: { caption: 'قف' } } } }), 'قف');
  });

  it('empty for anything without text', () => {
    assert.equal(inboundText(undefined), '');
    assert.equal(inboundText({ stickerMessage: {} }), '');
  });
});
