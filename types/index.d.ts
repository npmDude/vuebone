declare var __DEV__: boolean;

type ObjectHash = Record<string, any>;
type _StringKey<T> = keyof T & string;

interface Parseable {
  parse?: boolean;
}
