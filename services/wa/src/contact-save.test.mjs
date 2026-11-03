import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_NAME_MAX, contactAction, contactName, saveContact } from './contact-save.mjs';

const JID = '201001234567@s.whatsapp.net';

function fakeSocket({ exists = true, onWhatsApp, addOrEditContact } = {}) {
  const calls = [];
  return {
    calls,
    onWhatsApp: onWhatsApp ?? (async (jid) => [{ jid, exists }]),
    addOrEditContact:
      addOrEditContact ??
      (async (jid, action) => {
        calls.push({ jid, action });
      }),
  };
}

describe('contactName', () => {
  it('folds whitespace and strips invisible bidi marks', () => {
    assert.equal(contactName('  ‏أحمد   \n محمد‎ '), 'أحمد محمد');
  });

  it('caps the length', () => {
    assert.equal(contactName('ا'.repeat(200)).length, CONTACT_NAME_MAX);
  });

  it('is empty for nothing printable', () => {
    assert.equal(contactName('‏ ‫'), '');
    assert.equal(contactName(null), '');
  });
});

describe('contactAction', () => {
  it('never asks for the phone address book', () => {
    assert.equal(contactAction('أحمد محمد', null).saveOnPrimaryAddressbook, false);
  });

  it('first name is the first word', () => {
    assert.deepEqual(contactAction('أحمد محمد علي', null), {
      fullName: 'أحمد محمد علي',
      firstName: 'أحمد',
      saveOnPrimaryAddressbook: false,
    });
  });

  it('carries a known LID, and nothing that is not one', () => {
    assert.equal(contactAction('x', '123@lid').lidJid, '123@lid');
    assert.equal('lidJid' in contactAction('x', JID), false);
  });
});

describe('saveContact', () => {
  it('writes the contact under the PHONE jid, not the LID', async () => {
    const socket = fakeSocket();
    const result = await saveContact(socket, { jid: JID, name: 'أحمد محمد' }, { lidFor: async () => '999@lid' });
    assert.deepEqual(result, { saved: true, onWhatsApp: true, jid: JID, lid: '999@lid' });
    assert.equal(socket.calls.length, 1);
    assert.equal(socket.calls[0].jid, JID);
    assert.equal(socket.calls[0].action.lidJid, '999@lid');
    assert.equal(socket.calls[0].action.saveOnPrimaryAddressbook, false);
  });

  it('skips a number with no WhatsApp account without writing anything', async () => {
    const socket = fakeSocket({ exists: false });
    const result = await saveContact(socket, { jid: JID, name: 'أحمد' });
    assert.deepEqual(result, { saved: false, onWhatsApp: false, jid: JID, lid: null });
    assert.equal(socket.calls.length, 0);
  });

  it('an empty existence answer is a failure, not «not on WhatsApp»', async () => {
    const socket = fakeSocket({ onWhatsApp: async () => undefined });
    await assert.rejects(saveContact(socket, { jid: JID, name: 'أحمد' }), (error) => error.status === 502);
    assert.equal(socket.calls.length, 0);
  });

  it('refuses while WhatsApp is restricting the account — before any lookup', async () => {
    let looked = false;
    const socket = fakeSocket({
      onWhatsApp: async () => {
        looked = true;
        return [{ exists: true }];
      },
    });
    const until = new Date('2026-11-04T10:00:00Z');
    await assert.rejects(
      saveContact(socket, { jid: JID, name: 'أحمد' }, { blocked: () => ({ reason: 'timelock', until }) }),
      (error) => error.status === 423 && error.extra.code === 'timelock' && error.extra.until === until.toISOString(),
    );
    assert.equal(looked, false);
  });

  it('refuses an empty name', async () => {
    await assert.rejects(saveContact(fakeSocket(), { jid: JID, name: ' ‏ ' }), (error) => error.status === 400);
  });

  it('a write WhatsApp never confirms times out instead of holding the queue', async () => {
    const socket = fakeSocket({ addOrEditContact: () => new Promise(() => {}) });
    await assert.rejects(
      saveContact(socket, { jid: JID, name: 'أحمد' }, { timeoutMs: 20 }),
      (error) => error.status === 504,
    );
  });

  it('a write WhatsApp refuses is thrown, so the run stops on it', async () => {
    const socket = fakeSocket({
      addOrEditContact: async () => {
        throw new Error('App state key not present!');
      },
    });
    await assert.rejects(saveContact(socket, { jid: JID, name: 'أحمد' }), /App state key/);
  });

  it('a lookup of the LID that throws is "unknown", not a failure', async () => {
    const socket = fakeSocket();
    const result = await saveContact(
      socket,
      { jid: JID, name: 'أحمد' },
      {
        lidFor: async () => {
          throw new Error('db');
        },
      },
    );
    assert.equal(result.saved, true);
    assert.equal(result.lid, null);
  });
});
