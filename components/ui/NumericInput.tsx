'use client';

import {
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from '@/lib/validation/numeric-input';

interface NumericInputProps {
  value: string;
  onChange: (value: string) => void;
  mode?: 'integer' | 'decimal';
  className?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
}

export default function NumericInput({
  value,
  onChange,
  mode = 'integer',
  className = '',
  placeholder,
  maxLength,
  disabled,
  required,
}: NumericInputProps) {
  return (
    <input
      type="text"
      inputMode={mode === 'decimal' ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={value}
      required={required}
      disabled={disabled}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => {
        const next =
          mode === 'decimal'
            ? sanitizeDecimalInput(e.target.value)
            : sanitizeIntegerInput(e.target.value);
        onChange(next);
      }}
      className={className}
    />
  );
}
