import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChatLabels, foldLabelName } from './chat-labels.mjs';

function memoryIo(initial) {
  const files = new Map(initial ? [['/auth/labels.json', initial]] : []);
  return {
    files,
    io: {
      readFile: async (path) => {
        if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return files.get(path);
      },
      writeFile: async (path, data) => {
        files.set(path, data);
      },
    },
  };
}

describe('foldLabelName', () => {
  it('treats spelling and spacing variants as one name', () => {
    assert.equal(foldLabelName(' محتاج  رد منى '), foldLabelName('محتاج رد مني'));
  });
});

describe('ChatLabels', () => {
  it('learns a label from a sync event and finds it by name', async () => {
    const { io, files } = memoryIo();
    const labels = new ChatLabels('/auth', undefined, io);
    await labels.observe({ id: '7', name: 'محتاج رد مني', color: 1, deleted: false });
    assert.equal(await labels.idFor('محتاج رد منى'), '7');
    assert.match(files.get('/auth/labels.json'), /"7"/);
  });

  it('survives a restart through the file next to the credentials', async () => {
    const { io } = memoryIo(JSON.stringify([{ id: '9', name: 'محتاج رد مني' }]));
    const labels = new ChatLabels('/auth', undefined, io);
    assert.equal(await labels.idFor('محتاج رد مني'), '9');
  });

  it('forgets a deleted label and follows a rename', async () => {
    const { io } = memoryIo();
    const labels = new ChatLabels('/auth', undefined, io);
    await labels.observe({ id: '3', name: 'قديم', deleted: false });
    await labels.observe({ id: '3', name: 'محتاج رد مني', deleted: false });
    assert.equal(await labels.idFor('قديم'), null);
    assert.equal(await labels.idFor('محتاج رد مني'), '3');
    await labels.observe({ id: '3', name: 'محتاج رد مني', deleted: true });
    assert.equal(await labels.idFor('محتاج رد مني'), null);
  });

  it('answers null on an account with no such label (a personal number)', async () => {
    const { io } = memoryIo();
    assert.equal(await new ChatLabels('/auth', undefined, io).idFor('محتاج رد مني'), null);
  });
});
