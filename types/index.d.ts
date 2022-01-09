declare var __DEV__: boolean;

type ObjectHash = Record<string, any>;
type _StringKey<T> = keyof T & string;

interface Parseable {
    parse?: boolean;
}

// Collection

interface AddOptions {
    at?: number;
    merge?: boolean;
}

interface CollectionSetOptions extends Parseable {
    add?: boolean | undefined;
    remove?: boolean | undefined;
    merge?: boolean | undefined;
    at?: number | undefined;
    sort?: boolean | undefined;
}