import { test } from 'node:test';
import assert from 'node:assert/strict';
import rankBids from '../src/rankBids.js';

const bundle = { ceiling: 25 };

function bid(bid_id, price, tests, scope, agent) {
  return { bid_id, price, approach: { tests, scope }, agent };
}

test('returns empty for no bids', () => {
  assert.deepEqual(rankBids(bundle, []), []);
  assert.deepEqual(rankBids(bundle, undefined), []);
});

test('shape: bid_id, rank, score, reason for every bid', () => {
  const out = rankBids(bundle, [
    bid('b1', 10, true, 'tests and docs', 'did:a'),
    bid('b2', 12, false, '', 'did:b'),
  ]);
  assert.equal(out.length, 2);
  for (const row of out) {
    assert.equal(typeof row.bid_id, 'string');
    assert.equal(typeof row.rank, 'number');
    assert.ok(row.score >= 0 && row.score <= 100);
    assert.equal(typeof row.reason, 'string');
  }
  assert.deepEqual(out.map((r) => r.rank), [1, 2]);
});

test('every reason has at least 10 words', () => {
  const out = rankBids(bundle, [
    bid('b1', 10, true, 'tests and docs', 'did:a'),
    bid('b2', 12, false, '', 'did:b'),
    bid('b3', 30, 'unit tests', undefined, 'did:c'),
    bid('b4', 5, [], '', 'did:d'),
  ]);
  for (const row of out) {
    const words = row.reason.trim().split(/\s+/).length;
    assert.ok(words >= 10, 'reason of ' + row.bid_id + ' has ' + words + ' words');
  }
});

test('a cheaper bid with no tests never outranks a tested bid', () => {
  const cases = [
    { ceiling: 25, untestedPrice: 1, testedPrice: 25 },
    { ceiling: 25, untestedPrice: 1, testedPrice: 24.99 },
    { ceiling: 100, untestedPrice: 0.01, testedPrice: 100 },
    { ceiling: 10, untestedPrice: 1, testedPrice: 9.5 },
  ];
  for (const c of cases) {
    const out = rankBids({ ceiling: c.ceiling }, [
      bid('untested', c.untestedPrice, false, 'x', 'u'),
      bid('tested', c.testedPrice, true, 'x', 't'),
    ], {
      u: { accepted: 50, rejected: 0, cerberus_tier: 'gold' },
      t: { accepted: 0, rejected: 0, cerberus_tier: 'unproven' },
    });
    const byId = Object.fromEntries(out.map((r) => [r.bid_id, r]));
    assert.ok(byId.tested.rank < byId.untested.rank,
      'tested must lead for ceiling ' + c.ceiling);
    assert.ok(byId.tested.score > byId.untested.score,
      'tested score must be higher for ceiling ' + c.ceiling);
  }
});

test('every tested bid outranks every untested bid in mixed tables', () => {
  const bids = [
    bid('t1', 25, true, '', 'a'),
    bid('t2', 10, 'deep tests', 'full scope description here', 'b'),
    bid('u1', 1, false, '', 'c'),
    bid('u2', 2, [], 'scope', 'd'),
    bid('t3', 30, ['test'], 'x', 'e'),
  ];
  const out = rankBids(bundle, bids);
  const scores = Object.fromEntries(out.map((r) => [r.bid_id, r.score]));
  const testedMin = Math.min(scores.t1, scores.t2, scores.t3);
  const untestedMax = Math.max(scores.u1, scores.u2);
  assert.ok(testedMin > untestedMax);
  const rankOf = Object.fromEntries(out.map((r) => [r.bid_id, r.rank]));
  assert.ok(Math.max(rankOf.t1, rankOf.t2, rankOf.t3) < Math.min(rankOf.u1, rankOf.u2));
});

test('deterministic: same input twice, shuffled input same order', () => {
  const bids = [
    bid('b1', 10, true, 'scope one', 'a'),
    bid('b2', 9, false, '', 'b'),
    bid('b3', 11, ['t'], 'scope three', 'c'),
    bid('b4', 8, true, '', 'd'),
  ];
  const once = rankBids(bundle, bids, { a: { accepted: 2, rejected: 1, cerberus_tier: 'silver' } });
  const twice = rankBids(bundle, bids, { a: { accepted: 2, rejected: 1, cerberus_tier: 'silver' } });
  assert.deepEqual(once, twice);
  const shuffled = rankBids(bundle, [bids[2], bids[0], bids[3], bids[1]],
    { a: { accepted: 2, rejected: 1, cerberus_tier: 'silver' } });
  assert.deepEqual(shuffled, once);
});

test('price above the ceiling earns no price points and says so', () => {
  const out = rankBids(bundle, [bid('over', 40, true, '', 'a')]);
  assert.ok(out[0].reason.includes('above the ceiling'));
  const under = rankBids(bundle, [bid('under', 12.5, true, '', 'a')]);
  assert.ok(under[0].score > out[0].score);
});

test('better record and tier rank higher at the same price', () => {
  const out = rankBids(bundle, [
    bid('strong', 20, true, '', 'a'),
    bid('weak', 20, true, '', 'b'),
  ], {
    a: { accepted: 6, rejected: 0, cerberus_tier: 'gold' },
    b: { accepted: 0, rejected: 3, cerberus_tier: 'unproven' },
  });
  assert.equal(out[0].bid_id, 'strong');
});

test('scores stay within 0 to 100', () => {
  const out = rankBids({ ceiling: 1 }, [
    bid('high', 0.01, true, 'long scope description with enough words', 'a'),
    bid('low', 99, false, '', 'b'),
    bid('neg', -5, true, '', 'c'),
  ], { a: { accepted: 9, cerberus_tier: 'gold' } });
  for (const row of out) {
    assert.ok(row.score >= 0 && row.score <= 100, 'score out of range: ' + row.score);
  }
});
