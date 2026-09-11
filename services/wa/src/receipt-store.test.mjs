import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReceiptStore, STATUS, statusFromReceipt } from './receipt-store.mjs';

describe('ReceiptStore', () => {
  it('relays the first real status and then stays quiet about duplicates', () => {
    const store = new ReceiptStore();
    assert.equal(store.observe('A', STATUS.DELIVERY_ACK), STATUS.DELIVERY_ACK);
    assert.equal(store.observe('A', STATUS.DELIVERY_ACK), null);
    assert.equal(store.observe('A', STATUS.DELIVERY_ACK), null);
  });

  it('relays an upgrade', () => {
    const store = new ReceiptStore();
    store.observe('A', STATUS.SERVER_ACK);
    assert.equal(store.observe('A', STATUS.DELIVERY_ACK), STATUS.DELIVERY_ACK);
    assert.equal(store.observe('A', STATUS.READ), STATUS.READ);
  });

  it('never walks a row backwards', () => {
    // The case that matters: receipts arrive out of order, and a late
    // DELIVERY_ACK after a READ must not turn «قراها» back into «وصلت».
    const store = new ReceiptStore();
    store.observe('A', STATUS.READ);
    assert.equal(store.observe('A', STATUS.DELIVERY_ACK), null);
    assert.equal(store.observe('A', STATUS.SERVER_ACK), null);
  });

  it('says nothing about a status below the first tick', () => {
    const store = new ReceiptStore();
    assert.equal(store.observe('A', STATUS.PENDING), null);
    // …and having ignored it, a real status is still news.
    assert.equal(store.observe('A', STATUS.SERVER_ACK), STATUS.SERVER_ACK);
  });

  it('always relays a refusal, and never lets it become the maximum', () => {
    const store = new ReceiptStore();
    store.observe('A', STATUS.DELIVERY_ACK);
    assert.equal(store.observe('A', STATUS.ERROR), STATUS.ERROR);
    // The refusal did not overwrite the delivery…
    assert.equal(store.get('A'), STATUS.DELIVERY_ACK);
    // …and it is relayed every time, because the API decides what it means.
    assert.equal(store.observe('A', STATUS.ERROR), STATUS.ERROR);
  });

  it('ignores a missing id or a non-numeric status', () => {
    const store = new ReceiptStore();
    assert.equal(store.observe(null, STATUS.DELIVERY_ACK), null);
    assert.equal(store.observe(undefined, STATUS.DELIVERY_ACK), null);
    assert.equal(store.observe('', STATUS.DELIVERY_ACK), null);
    assert.equal(store.observe('A', undefined), null);
    assert.equal(store.observe('A', null), null);
    assert.equal(store.observe('A', 'delivered'), null);
    assert.equal(store.observe('A', NaN), null);
  });

  it('evicts the oldest id once it is full', () => {
    const store = new ReceiptStore(2);
    store.observe('A', STATUS.SERVER_ACK);
    store.observe('B', STATUS.SERVER_ACK);
    store.observe('C', STATUS.SERVER_ACK);
    assert.equal(store.size, 2);
    assert.equal(store.get('A'), undefined);
    // Evicted, so its next receipt reads as news again — which is correct:
    // the API is the durable record, not this map.
    assert.equal(store.observe('A', STATUS.SERVER_ACK), STATUS.SERVER_ACK);
  });

  it('keeps a message that is still receiving receipts, and drops the quiet one', () => {
    const store = new ReceiptStore(2);
    store.observe('A', STATUS.SERVER_ACK);
    store.observe('B', STATUS.SERVER_ACK);
    // A is still alive — this re-seats it as the newest.
    store.observe('A', STATUS.DELIVERY_ACK);
    store.observe('C', STATUS.SERVER_ACK);
    assert.equal(store.get('A'), STATUS.DELIVERY_ACK);
    assert.equal(store.get('B'), undefined);
  });
});

describe('statusFromReceipt', () => {
  it('reads a delivery receipt', () => {
    assert.equal(statusFromReceipt({ receiptTimestamp: 1_760_000_000 }), STATUS.DELIVERY_ACK);
  });

  it('reads a read receipt, whichever fields come with it', () => {
    assert.equal(statusFromReceipt({ readTimestamp: 1_760_000_000 }), STATUS.READ);
    // Both present: read outranks delivered, because a message cannot be read
    // without having been delivered whatever order the fields arrive in.
    assert.equal(
      statusFromReceipt({ receiptTimestamp: 1_760_000_000, readTimestamp: 1_760_000_001 }),
      STATUS.READ,
    );
  });

  it('has nothing to say about an empty or absent receipt', () => {
    assert.equal(statusFromReceipt(null), null);
    assert.equal(statusFromReceipt(undefined), null);
    assert.equal(statusFromReceipt({}), null);
    assert.equal(statusFromReceipt('delivered'), null);
    assert.equal(statusFromReceipt({ receiptTimestamp: 0 }), null);
  });
});
