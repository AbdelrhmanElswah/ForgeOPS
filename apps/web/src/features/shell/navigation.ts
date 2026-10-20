import { FolderGit2, LayoutDashboard, ListChecks, Plug } from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavigationItem {
  href: string;
  label: string;
  icon: ComponentType;
}

/** The app's main navigation, defined once. Adding a section is one entry here. */
export const NAVIGATION: readonly NavigationItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { href: '/settings/integrations', label: 'Integrations', icon: Plug },
];

/** A section stays highlighted on its sub-pages too (/tasks/123 → Tasks). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
