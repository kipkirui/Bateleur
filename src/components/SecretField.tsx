import { useState } from "react";

type Props = {
  value: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

export function SecretField({
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
  disabled,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="secret">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
      <button
        type="button"
        className="secret-toggle"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((open) => !open)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 8S3.5 3.5 8 3.5 14.5 8 14.5 8 12.5 12.5 8 12.5 1.5 8 1.5 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 8S3.5 3.5 8 3.5 14.5 8 14.5 8 12.5 12.5 8 12.5 1.5 8 1.5 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 13 L13 3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
