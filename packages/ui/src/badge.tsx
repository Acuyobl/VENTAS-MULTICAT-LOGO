import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
  children: ReactNode;
}

export function Badge({ className, tone = 'neutral', children, ...props }: BadgeProps) {
  return (
    <span className={cn('vc-badge', `vc-badge--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}
