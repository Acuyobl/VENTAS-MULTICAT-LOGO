import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <label className="vc-field" htmlFor={inputId}>
      {label ? <span className="vc-field__label">{label}</span> : null}
      <input
        ref={ref}
        id={inputId}
        className={cn('vc-input', error ? 'vc-input--error' : undefined, className)}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <span className="vc-field__error">{error}</span> : null}
      {hint && !error ? <span className="vc-field__hint">{hint}</span> : null}
    </label>
  );
});
