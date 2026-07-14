// Loading-screen tips. Shown one at a time during the LOADING phase
// (and any other slow-load surface that wants light onboarding). Kept
// as flat data so it's easy to add / edit / translate later without
// touching a UI component. Import + pickRandomTip() to get one.
//
// Guidelines when adding:
// - Under ~140 chars so it never wraps to 3 lines on a phone.
// - Present-tense, casual, no punctuation-heavy sentences.
// - Focus on one thing per tip — currency, mechanics, rewards, etc.

export const LOADING_TIPS = [
  // Snapple basics
  { title: 'What\'s a snapple?', body: 'A short vertical video you can play as a card in the game. Record your own or collect ones other people made.' },
  { title: 'Play a snapple, win a round', body: 'Each round you pick the snapple in your hand that matches the prompt best. Most votes takes the round.' },
  { title: 'Voting is anonymous', body: 'You see the cards but not who submitted them until scoring reveals it.' },

  // Currency
  { title: 'How you get coins', body: 'Win rounds, complete achievements, and open your daily reward for a coin drop.' },
  { title: 'What tickets do', body: 'Spend 1 ticket to summon your own custom prompt into the pool. Everyone in the game sees it.' },
  { title: 'XP and levels', body: 'You earn XP for recording snapples and playing rounds. XP boosts unlock cosmetic tiers.' },

  // Deck / collection
  { title: 'Your deck', body: 'Snapples you\'ve saved or purchased. When you play a game, cards from your deck get mixed into your hand.' },
  { title: 'Buy other people\'s snapples', body: 'See a card you like during voting? Tap the diamond in preview to add it to your collection.' },
  { title: 'Wishlist for later', body: 'Tap the heart in preview to save a card you might want to buy after the round.' },

  // Rewards
  { title: 'Round wins pay out', body: 'The card with the most votes each round earns its owner XP and coins.' },
  { title: 'Rare snapples worth more', body: 'Snapples that get played + win a lot climb in price. Grab them early.' },
  { title: 'Achievements pop as you play', body: 'Streaks, milestones, first-time actions — most give a coin + XP bump the moment they trigger.' },

  // Prompt system
  { title: 'Prompts rotate', body: 'The pool cycles so you rarely see the same prompt twice in a row. Popular ones come back around.' },
  { title: 'Create your own prompt', body: 'Costs 1 ticket. Your prompt goes into the live pool and can be voted on and remembered.' },

  // Game feel
  { title: '60 seconds per phase', body: 'You get a full minute to pick and to vote — no rushed decisions.' },
  { title: 'Practice mode uses bots', body: 'Solo practice fills the lobby with bots so you can learn the flow without pressure.' },
  { title: 'Tap and hold the ?', body: 'The little ? in the header shows what to do this phase. Press it any time you\'re lost.' },
];

// Pick a tip index at random. Passing a "seen" set skips tips the
// caller has shown recently so the same tip doesn't repeat back-to-back.
export function pickRandomTip(seen) {
  const pool = LOADING_TIPS.filter((_, i) => !seen || !seen.has(i));
  const source = pool.length > 0 ? pool : LOADING_TIPS;
  const idx = Math.floor(Math.random() * source.length);
  const tip = source[idx];
  return { tip, index: LOADING_TIPS.indexOf(tip) };
}
