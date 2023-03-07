export type ArrayElement<T> = T extends Array<infer Element> ? Element : never;

export type UnionToIntersection<T> = (T extends any ? (x: T) => any : never) extends (x: infer R) => any ? R : never;

type PathImpl<T, Key extends keyof T> = Key extends string
  ? Required<T>[Key] extends Record<string, any>
    ? Required<T>[Key] extends any[]
      ? never
      :
          | `${Key}.${PathImpl<Required<T>[Key], Exclude<keyof Required<T>[Key], keyof any[]>> & string}`
          | `${Key}.${keyof Required<T>[Key] & string}`
    : never
  : never;

export type Path<T> = PathImpl<T, keyof T> | keyof T;

export type PathValue<T, P extends Path<T>> = P extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? Rest extends Path<Required<T>[Key]>
      ? PathValue<Required<T>[Key], Rest>
      : never
    : never
  : P extends keyof T
  ? T[P]
  : never;

export type PickPath<T, P extends Path<T>> = P extends keyof T
  ? Pick<T, P>
  : P extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? Rest extends Path<Required<T>[Key]>
      ? PickPath<Required<T>[Key], Rest>
      : never
    : never
  : never;
