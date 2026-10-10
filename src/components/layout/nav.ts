import { BookOpen, House, Swords, Target, Trophy, UserRound, UsersRound, type LucideIcon } from 'lucide-react';

export type NavItem = { to: string; label: string; short: string; icon: LucideIcon; match: (path: string) => boolean };

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', short: 'Home', icon: House, match: (p) => p === '/' },
  { to: '/leaderboard', label: 'Leaderboard', short: 'Board', icon: Trophy, match: (p) => p.startsWith('/leaderboard') },
  { to: '/play', label: 'Play', short: 'Play', icon: Target, match: (p) => p.startsWith('/play') },
  { to: '/vocab', label: 'Vocab', short: 'Vocab', icon: BookOpen, match: (p) => p.startsWith('/vocab') },
  { to: '/arena', label: 'Arena', short: 'Arena', icon: Swords, match: (p) => p.startsWith('/arena') },
  { to: '/chapter', label: 'Chapter', short: 'Chapter', icon: UsersRound, match: (p) => p.startsWith('/chapter') },
  { to: '/me', label: 'Me', short: 'Me', icon: UserRound, match: (p) => p.startsWith('/me') || p.startsWith('/u/') },
];
