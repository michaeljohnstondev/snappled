# Snappled — Feature Backlog

## Admin / Moderation
- [ ] Admin panel (web or in-app) to review reported content
- [ ] Admin review queue for user-created prompts before they go live
- [ ] Ability to ban/unban users from admin panel
- [ ] View moderation strike history per user
- [ ] Bulk actions (delete multiple snapples, approve/reject prompts)
- [ ] Admin dashboard with app metrics (active users, snapples created, games played)

## Gameplay
- [ ] Real multiplayer testing with 2+ humans
- [ ] Voice chat (Agora integration)
- [ ] Game modes: Ranked, Speed Round, 1v1 Duel, Theme Night
- [ ] Community judging for top-tier games (spectator votes count)
- [ ] Rematch / play again with same players
- [ ] Friend invites to private lobbies

## Monetization
- [ ] In-app purchases for coins (RevenueCat / Stripe)
- [ ] Premium features / subscription tier
- [ ] Ad integration (rewarded ads for free coins)

## Social
- [x] Push notifications (game invites, follows, prompt expiry)
- [ ] DMs / messaging between users
- [ ] Feed of followed users' new snapples
- [ ] Trending page

## Polish
- [ ] Sound settings toggle (soundService.setEnabled already exists, no UI yet)
- [ ] /snappled landing page on bigvibestudios.com — shares currently point
      at the studio root because no download page exists yet
- [ ] Logo / splash screen
- [ ] Onboarding flow for new users
- [ ] Settings screen (change username, email, notifications)
- [ ] Google Sign-In (needs expo-auth-session + OAuth client IDs)
- [ ] Apple Sign-In
- [ ] Upgrade Expo SDK to fix dev client crash

## Data / Analytics
- [ ] Analytics dashboard (Firebase Analytics)
- [ ] A/B testing for prompt engagement
- [ ] User retention tracking
