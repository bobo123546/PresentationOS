/** The renderer consumes the same role-based contract as the design-token schema. */
export interface DesignTokens {
  schema: 'design-token';
  version: '1';
  colors: { primary: string; secondary: string; background: string; text: string;
    accent?: string; surface?: string; muted?: string; [role: string]: unknown };
  fonts: { heading: string; body: string; mono?: string; [role: string]: unknown };
}

export function readDesignTokens(value?: Record<string, unknown>): DesignTokens | undefined {
  if (!value || (!('schema' in value) && !('colors' in value) && !('fonts' in value))) return undefined;
  if (value.schema !== 'design-token' || value.version !== '1') throw new Error('Unsupported design-token schema or version');
  const colors = value.colors as Record<string, unknown> | undefined;
  const fonts = value.fonts as Record<string, unknown> | undefined;
  if (!colors || !fonts || typeof colors !== 'object' || typeof fonts !== 'object') throw new Error('Design tokens require colors and fonts');
  for (const role of ['primary', 'secondary', 'background', 'text', 'accent', 'surface', 'muted', ...Object.keys(colors).filter(key => /^series[1-6]$/.test(key))]) {
    const color = colors[role];
    if (color === undefined && ['accent', 'surface', 'muted'].includes(role)) continue;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`Invalid design color: ${role}`);
  }
  for (const role of ['heading', 'body']) {
    if (typeof fonts[role] !== 'string' || !(fonts[role] as string).trim() || /[\u0000-\u001f]/.test(fonts[role] as string)) throw new Error(`Invalid design font: ${role}`);
  }
  return value as unknown as DesignTokens;
}

/** Choose a readable foreground for solid brand fills; source content is unchanged. */
export function onColor(hex: string): string {
  const rgb = hex.replace('#', '').match(/../g)!.map(channel => {
    const v = parseInt(channel, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const light = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  return (light + .05) / .05 >= 1.05 / (light + .05) ? '000000' : 'FFFFFF';
}
