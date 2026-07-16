// Sort options and helper for snapple grids on profile screens.
// Shared between UserProfileScreen and OtherPersonsProfile so the
// dropdown labels + sort semantics stay consistent.

// Options shape mirrors SectionDropdown's contract: { label, value }.
// Order = default UI order in the dropdown.
export const SNAPPLE_SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Most Liked', value: 'liked' },
  { label: 'Most Owned', value: 'owned' },
  { label: 'Most Played', value: 'played' },
];

// Coerce createdAt to a comparable string. Handles both ISO strings
// (current) and legacy Firestore Timestamp objects (older docs).
function toKey(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v.toDate === 'function') {
    try { return v.toDate().toISOString(); } catch (e) { return ''; }
  }
  if (typeof v === 'number') return new Date(v).toISOString();
  return '';
}

// Return a NEW sorted array. Doesn't mutate the input. Unknown sort
// keys fall through to 'newest'.
export function sortSnapples(snapples, sortKey) {
  const arr = Array.isArray(snapples) ? [...snapples] : [];
  switch (sortKey) {
    case 'oldest':
      return arr.sort((a, b) => toKey(a.createdAt).localeCompare(toKey(b.createdAt)));
    case 'liked':
      return arr.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    case 'owned':
      // Prefer buyCount (marketplace churn) but fall back to owners
      // array length so legacy docs still sort meaningfully.
      return arr.sort((a, b) => {
        const av = (a.buyCount || 0) || (a.owners?.length || 0);
        const bv = (b.buyCount || 0) || (b.owners?.length || 0);
        return bv - av;
      });
    case 'played':
      return arr.sort((a, b) => (b.gamesPlayed || 0) - (a.gamesPlayed || 0));
    case 'newest':
    default:
      return arr.sort((a, b) => toKey(b.createdAt).localeCompare(toKey(a.createdAt)));
  }
}
