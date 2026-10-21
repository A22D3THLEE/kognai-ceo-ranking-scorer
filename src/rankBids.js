/**
 * @typedef {Object} Bundle
 * @property {number} ceiling bid ceiling in USDC
 * @property {string} [id]
 * @property {string} [title]
 *
 * @typedef {Object} Approach
 * @property {boolean|string|Array<string>} [tests] what the bid ships as tests
 * @property {string|Array<string>} [scope] what the bid covers
 *
 * @typedef {Object} Bid
 * @property {string} bid_id
 * @property {number} price price in USDC
 * @property {Approach} [approach]
 * @property {string} [agent] agent id or DID, joins the record
 *
 * @typedef {Object} AgentRecord
 * @property {number} [accepted] accepted deliveries in the past
 * @property {number} [rejected] rejected deliveries in the past
 * @property {'unproven'|'bronze'|'silver'|'gold'} [cerberus_tier]
 *
 * @typedef {Object} RankedBid
 * @property {string} bid_id
 * @property {number} rank 1 based
 * @property {number} score 0 to 100
 * @property {string} reason at least 10 words
 */

const TIER_POINTS = { gold: 5, silver: 3.5, bronze: 2, unproven: 0 };

function hasTests(approach) {
  const t = approach && approach.tests;
  if (t === true) return true;
  if (typeof t === 'string') return t.trim().length > 0;
  if (Array.isArray(t)) return t.length > 0;
  return false;
}

function scopePoints(approach) {
  const s = approach && approach.scope;
  if (typeof s === 'string') {
    const len = s.trim().length;
    if (len === 0) return 0;
    return len >= 40 ? 10 : 6;
  }
  if (Array.isArray(s)) {
    if (s.length === 0) return 0;
    return s.length >= 3 ? 10 : 6;
  }
  return 0;
}

function recordPoints(record) {
  if (!record) return { points: 0, rate: 0, total: 0 };
  const accepted = Math.max(0, Number(record.accepted) || 0);
  const rejected = Math.max(0, Number(record.rejected) || 0);
  const total = accepted + rejected;
  if (total === 0) return { points: 0, rate: 0, total: 0 };
  const rate = accepted / total;
  const volume = Math.min(1, total / 6);
  return { points: 5 * rate * volume, rate, total, accepted, rejected };
}

function tierPoints(record) {
  const tier = record && record.cerberus_tier;
  return TIER_POINTS[tier] || 0;
}

/**
 * Ranks bids on price against the ceiling, the approach (tests, scope),
 * the agent track record and its Cerberus tier.
 *
 * Weights: tests 40, price 40, scope 10, record 5, tier 5.
 * A bid without tests is capped at 35 points, so every tested bid,
 * whose floor is 40 points, stays ahead of every untested bid.
 * A price above the ceiling earns 0 price points.
 *
 * @param {Bundle} bundle
 * @param {Bid[]} bids
 * @param {Record<string, AgentRecord>} [records] records keyed by agent id or DID
 * @returns {RankedBid[]} sorted by score descending, ties by bid_id ascending
 */
export function rankBids(bundle, bids, records = {}) {
  if (!Array.isArray(bids) || bids.length === 0) return [];
  const ceiling = Number(bundle && bundle.ceiling);
  const ceilingOk = Number.isFinite(ceiling) && ceiling > 0;

  const scored = bids.map((bid) => {
    const price = Number(bid.price);
    let pricePoints = 0;
    let priceNote = 'price at or under the ceiling earns the full price part';
    if (ceilingOk && Number.isFinite(price)) {
      if (price <= ceiling) {
        pricePoints = Math.min(40, Math.max(0, 40 * ((ceiling - price) / ceiling)));
      } else {
        pricePoints = 0;
        priceNote = 'price above the ceiling sets the price part to 0';
      }
    } else {
      priceNote = 'a missing ceiling sets the price part to 0';
    }

    const tested = hasTests(bid.approach);
    const scope = scopePoints(bid.approach);
    const agentKey = bid.agent || '';
    const rec = records[agentKey] || records[bid.bid_id] || null;
    const record = recordPoints(rec);
    const tier = tierPoints(rec);

    let score = pricePoints + (tested ? 40 : 0) + scope + record.points + tier;
    if (!tested) score = Math.min(score, 35);
    score = Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;

    const reason =
      'Ranks on ' + score + ' of 100 points: ' +
      priceNote + ', so the price ' + price + ' against the ceiling ' + ceiling +
      ' gives ' + Math.round(pricePoints * 100) / 100 + ' of 40, ' +
      (tested ? 'tests are present and add 40' : 'tests are missing, which keeps the score at or under 35') +
      ', scope gives ' + scope + ' of 10, ' +
      'the record over ' + record.total + ' deliveries gives ' +
      Math.round(record.points * 100) / 100 + ' of 5, ' +
      'the Cerberus tier gives ' + tier + ' of 5.';

    return { bid_id: String(bid.bid_id), score, reason, tested };
  });

  scored.sort((a, b) => b.score - a.score || (a.bid_id < b.bid_id ? -1 : a.bid_id > b.bid_id ? 1 : 0));

  return scored.map((s, i) => ({
    bid_id: s.bid_id,
    rank: i + 1,
    score: s.score,
    reason: s.reason,
  }));
}

export default rankBids;
