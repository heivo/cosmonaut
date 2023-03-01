export type ArrayElement<T> = T extends Array<infer Element> ? Element : never;

export type DeepRequired<T> = T extends any[]
  ? _DeepRequiredArray<T[number]>
  : T extends object
  ? _DeepRequiredObject<T>
  : T;
type NonUndefined<A> = A extends undefined ? never : A;
type _DeepRequiredArray<T> = Array<DeepRequired<NonUndefined<T>>>;
type _DeepRequiredObject<T> = { [P in keyof T]-?: DeepRequired<NonUndefined<T[P]>> };

type PathImpl<T, Key extends keyof T> = Key extends string
  ? T[Key] extends Record<string, any>
    ?
        | `${Key}.${PathImpl<T[Key], Exclude<keyof T[Key], keyof any[]>> & string}`
        | `${Key}.${Exclude<keyof T[Key], keyof any[]> & string}`
    : never
  : never;

export type Path<T> = PathImpl<T, keyof T> | keyof T;

export type PathValue<T, P extends Path<T>> = P extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? Rest extends Path<T[Key]>
      ? PathValue<T[Key], Rest>
      : never
    : never
  : P extends keyof T
  ? T[P]
  : never;
