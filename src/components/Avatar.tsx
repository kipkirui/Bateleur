import { avatarHue, initials } from "../lib/magazine";

type Props = {
  name: string;
  email: string;
  size?: "sm" | "md" | "lg";
};

export function Avatar({ name, email, size = "md" }: Props) {
  const hue = avatarHue(email);
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{
        background: `color-mix(in srgb, var(--bg-accent) 72%, hsl(${hue} 38% 42%))`,
      }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}
