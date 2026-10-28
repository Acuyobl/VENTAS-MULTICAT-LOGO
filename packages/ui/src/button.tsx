import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn('vc-btn', `vc-btn--${variant}`, `vc-btn--${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="vc-spinner" aria-hidden /> : null}
      {children}
    </button>
  );
});
