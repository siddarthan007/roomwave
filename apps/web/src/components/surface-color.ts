/** Foreground paired with one of the design system's named surfaces. */
export function onSurface(color: string): string {
  const token = color.match(
    /^var\(--(ink|red|blue|yellow|green|pink|orange|violet)\)$/,
  )?.[1];
  return token ? `var(--on-${token})` : "var(--ink)";
}
