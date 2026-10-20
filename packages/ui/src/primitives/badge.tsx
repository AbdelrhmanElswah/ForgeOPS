import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * Tones carry ONE meaning across the whole product: neutral = waiting, info = in progress,
 * warning = needs you, success = done, danger = failed. Apps map their domain states to a tone
 * in one place (e.g. task status → tone) instead of choosing colours per screen.
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        info: 'bg-info-soft text-info',
        warning: 'bg-warning-soft text-warning',
        success: 'bg-success-soft text-success',
        danger: 'bg-danger-soft text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type Tone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    /** A pulsing dot for states that are actively changing. */
    pulse?: boolean;
  };

export function Badge({ className, tone, pulse = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full bg-current', pulse && 'animate-pulse')}
      />
      {children}
    </span>
  );
}
