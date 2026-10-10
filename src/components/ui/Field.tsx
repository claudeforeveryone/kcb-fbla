import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from './cn';

const control =
  'w-full rounded-[10px] border bg-surface text-ink placeholder:text-muted/70 shadow-[inset_0_1px_1px_rgb(0_30_96/0.03)] ' +
  'transition-[border-color,box-shadow] duration-150 ease-out outline-none ' +
  'focus:border-blue focus:ring-4 focus:ring-blue/15 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted';

const tone = (error?: ReactNode) =>
  error ? 'border-danger focus:border-danger focus:ring-danger/15' : 'border-line-strong hover:border-muted/50';

type FieldShell = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Shown at the right of the label row, e.g. a "Forgot?" link or a counter. */
  corner?: ReactNode;
  className?: string;
};

export function FieldWrap({
  id,
  label,
  hint,
  error,
  corner,
  className,
  children,
}: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || corner) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={id} className="text-sm font-semibold text-ink">
              {label}
            </label>
          )}
          {corner && <div className="text-xs text-muted">{corner}</div>}
        </div>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-danger" role="alert">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: ReactNode, hint?: ReactNode) {
  return error ? `${id}-err` : hint ? `${id}-hint` : undefined;
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  FieldShell & {
    leftIcon?: ReactNode;
    right?: ReactNode;
    inputClassName?: string;
    size?: 'md' | 'lg';
  };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, corner, className, inputClassName, leftIcon, right, id, size = 'md', ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} hint={hint} error={error} corner={corner} className={className}>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted [&>svg]:size-4">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fid, error, hint)}
          className={cn(
            control,
            tone(error),
            size === 'lg' ? 'h-12 px-4 text-base' : 'h-10 px-3 text-[0.9375rem]',
            !!leftIcon && (size === 'lg' ? 'pl-11' : 'pl-9'),
            !!right && 'pr-11',
            inputClassName,
          )}
          {...rest}
        />
        {right && <div className="absolute inset-y-0 right-1.5 flex items-center">{right}</div>}
      </div>
    </FieldWrap>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, corner, className, id, rows = 4, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} hint={hint} error={error} corner={corner} className={className}>
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        className={cn(control, tone(error), 'min-h-20 resize-y px-3 py-2.5 text-[0.9375rem] leading-relaxed')}
        {...rest}
      />
    </FieldWrap>
  );
});

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  FieldShell & { options?: SelectOption[]; placeholder?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, corner, className, id, options, placeholder, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} hint={hint} error={error} corner={corner} className={className}>
      <div className="relative">
        <select
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fid, error, hint)}
          className={cn(control, tone(error), 'h-10 appearance-none pl-3 pr-9 text-[0.9375rem]')}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options?.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      </div>
    </FieldWrap>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const toggle = (
    <button
      id={fid}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? `${fid}-desc` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-out disabled:opacity-50',
        checked ? 'bg-blue' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
  if (!label) return <span className={className}>{toggle}</span>;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label htmlFor={fid} className="cursor-pointer text-sm font-semibold text-ink">
          {label}
        </label>
        {description && (
          <p id={`${fid}-desc`} className="mt-0.5 text-[0.8125rem] text-muted">
            {description}
          </p>
        )}
      </div>
      {toggle}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink', disabled && 'opacity-50', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-line-strong accent-[var(--blue)]"
      />
      {label}
    </label>
  );
}
