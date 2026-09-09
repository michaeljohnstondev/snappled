// rank.js — what "Rookie" is supposed to mean.
//
// The profile screens read `profile.rank` with `|| 'Rookie'` as a
// fallback, and NOTHING ever wrote that field. Every player saw Rookie
// forever: a badge presenting itself as a stat you could move, which is
// worse than no badge because it implies a progression that does not
// exist. Confirmed against live data — 21 users, zero with the field.
//
// Derived rather than stored: a pure function of things already on the
// user document. No new writes, no migration, and it cannot drift out
// of date the way a stored copy would.
//
// It reads FOUR axes rather than one. A single ladder off trophies
// would only ever reward winning rounds, and this app has more ways to
// be good at it than that — some people make the snapples, some collect
// them, some win with them, some bring the room. Your TIER comes from
// everything added up, so all of it counts; your TITLE comes from
// whichever axis you lead in, so it says what you are actually good at.
//
// Field choices are deliberate. `stats.totalVideosCreated` and
// `totalSnapplesPurchased` are both stale at 0 on accounts that plainly
// have neither, so this uses `videosCreated` and the length of the
// `ownedSnapples` array, which are the ones actually maintained.

const TIERS = [
  { name: 'Rookie', at: 0, color: '#9BA8B8' },
  { name: 'Bronze', at: 100, color: '#CD7F32' },
  { name: 'Silver', at: 250, color: '#C0C0C0' },
  { name: 'Gold', at: 500, color: '#FFD700' },
  { name: 'Platinum', at: 1000, color: '#7FFFD4' },
  { name: 'Diamond', at: 2000, color: '#00C6FF' },
];

/**
 * Score per axis.
 *
 * The weights exist to make four different units comparable, not to
 * express what matters most. Rarer actions are worth more: selling a
 * snapple is harder than making one, winning a game is harder than
 * earning a trophy, and someone following you is not something you can
 * do to yourself.
 */
function axes(user) {
  const stats = user?.stats || {};
  const res = user?.resources || {};
  const social = user?.social || {};
  const followers = (social.followers || []).length;
  const following = (social.following || []).length;
  const followerSet = new Set(social.followers || []);
  const mutuals = (social.following || []).filter(id => followerSet.has(id)).length;

  return {
    Creator: (stats.videosCreated || 0) * 2 + (stats.snapplesSold || 0) * 10,
    Collector: (user?.ownedSnapples || []).length * 3
      + (user?.wishlistedSnapples || []).length,
    Competitor: (res.trophies || 0) + (stats.gamesWon || 0) * 10,
    Socialite: followers * 5 + mutuals * 5 + Math.min(following, 25),
  };
}

/**
 * The rank a user has earned.
 *
 * Returns the tier plus the axis they lead in, so a caller can render
 * "Silver Creator" or just the tier. At zero on everything it is plain
 * Rookie with no title — claiming someone is a "Rookie Creator" before
 * they have made anything would be the same empty promise this replaced.
 */
export function rankFor(user) {
  const scores = axes(user);
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  let tier = TIERS[0];
  for (const t of TIERS) if (total >= t.at) tier = t;

  const leader = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const title = leader && leader[1] > 0 ? leader[0] : null;

  return {
    tier: tier.name,
    color: tier.color,
    title,
    // "Silver Creator", or just "Rookie" for someone brand new.
    name: title ? `${tier.name} ${title}` : tier.name,
    total,
    scores,
  };
}

/**
 * What it takes to reach the next tier.
 *
 * The badge alone answers "what am I" and not "how do I move", which is
 * the question a rank actually raises — and the one that had no answer
 * at all before. Returns null at the top so callers can tell "maxed"
 * from "nearly there".
 */
export function nextRank(user) {
  const { total } = rankFor(user);
  const next = TIERS.find(t => t.at > total);
  if (!next) return null;
  return { ...next, remaining: next.at - total };
}
