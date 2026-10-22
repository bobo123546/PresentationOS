declare module 'yaml' {
  export function parse(text: string): unknown;
  export function stringify(value: unknown): string;
}
