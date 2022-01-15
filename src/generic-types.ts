export type ObjectHash = Record<string, any>;
export type StringKey<T> = keyof T & string;

export interface Parseable {
  parse?: boolean;
}
