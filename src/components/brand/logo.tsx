import type { SVGProps } from "react";

/**
 * The owner's marks (logo/gen-word.svg and logo/fresh-b3.svg) inlined as components. The ink
 * follows the theme through `currentColor` (set `text-ink` on the consumer); the green dot is
 * the `brand-dot` token. The wordmark is live Arial type for now, as delivered: this component
 * is the single place to swap in drawn letterforms later.
 */
type LogoProps = Omit<SVGProps<SVGSVGElement>, "title"> & {
  /** Accessible name. Without it the graphic is decorative (aria-hidden). */
  title?: string;
};

function a11y(title: string | undefined) {
  return title ? { role: "img" as const } : { "aria-hidden": true as const };
}

export function Wordmark({ title, ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 680 200" xmlns="http://www.w3.org/2000/svg" {...a11y(title)} {...props}>
      {title ? <title>{title}</title> : null}
      <text
        x="40"
        y="150"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="150"
        fontWeight="700"
        letterSpacing="-7"
        fill="currentColor"
      >
        okinv
        <tspan fill="var(--color-brand-dot)">o</tspan>
      </text>
    </svg>
  );
}

export function Mark({ title, ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" {...a11y(title)} {...props}>
      {title ? <title>{title}</title> : null}
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M128,86 A66,66 0 1 1 128,218 A66,66 0 1 1 128,86 Z M128,118 A34,34 0 1 1 128,186 A34,34 0 1 1 128,118 Z"
      />
      <circle cx="128" cy="48" r="18" fill="var(--color-brand-dot)" />
    </svg>
  );
}
