'use client';

import { Button, NavItem, Shell } from '@forgeops/ui';
import { Hammer, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { useLogout, useSessionUser } from '@/features/auth';
import { LOGIN_PATH } from '@/shared';

import { isActive, NAVIGATION } from '../navigation';

/** The frame of every signed-in page. Layout comes from @forgeops/ui; this adds routing and the user. */
export function AppShell({ children }: { children: ReactNode }) {
  return <Shell sidebar={<Sidebar />}>{children}</Shell>;
}

function Sidebar() {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/dashboard" className="flex items-center gap-2 px-2 font-semibold">
        <Hammer aria-hidden className="size-5 text-primary" />
        ForgeOps
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAVIGATION.map(({ href, label, icon: Icon }) => (
          <NavItem key={href} active={isActive(pathname, href)}>
            <Link href={href}>
              <Icon />
              {label}
            </Link>
          </NavItem>
        ))}
      </nav>
      <UserMenu />
    </div>
  );
}

function UserMenu() {
  const user = useSessionUser();
  const logout = useLogout();
  const router = useRouter();

  return (
    <div className="mt-auto flex flex-col gap-2 border-t pt-4">
      <div className="px-2">
        <p className="truncate text-sm font-medium">{user.displayName ?? user.email}</p>
        {user.displayName && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start"
        loading={logout.isPending}
        onClick={() => {
          logout.mutate(undefined, {
            onSettled: () => {
              router.replace(LOGIN_PATH);
            },
          });
        }}
      >
        <LogOut aria-hidden />
        Sign out
      </Button>
    </div>
  );
}
