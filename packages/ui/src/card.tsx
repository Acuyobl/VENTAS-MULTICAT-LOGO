import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('vc-card', className)} {...props}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="vc-card__header">
      <div>
        <h3 className="vc-card__title">{title}</h3>
        {description ? <p className="vc-card__description">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
