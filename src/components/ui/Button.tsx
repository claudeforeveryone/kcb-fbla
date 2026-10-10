import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'inverse';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[2px] font-display font-semibold tracking-[-0.005em] ' +
  'transition-[background-color,color,transform,border-color] duration-200 ease-out ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-navy text-white hover:bg-navy-2 dark:bg-blue dark:hover:bg-[#4b7cc2]',
  accent:
    'bg-red text-white hover:bg-red-2',
  secondary:
    'bg-blue/10 text-blue hover:bg-blue/16 dark:bg-blue/20 dark:text-link dark:hover:bg-blue/28',
  outline:
    'border border-line-strong bg-surface text-ink hover:border-blue/50 hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-danger/10 text-danger hover:bg-danger hover:text-white',
  inverse: 'bg-white text-navy hover:bg-white/90',
};

const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-[0.9375rem]',
  lg: 'h-12 px-6 text-base',
  icon: 'size-10',
  'icon-sm': 'size-8',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
  block?: boolean,
) {
  return cn(base, variants[variant], sizes[size], block && 'w-full', extra);
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, block, leftIcon, rightIcon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className, block)}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export type ButtonLinkProps = Common & LinkProps;

/** A router link styled as a button. */
export function ButtonLink({ variant, size, block, leftIcon, rightIcon, className, children, loading: _l, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className, block)} {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}
