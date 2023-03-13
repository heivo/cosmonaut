# Cosmonaut

A type-safe CosmosDB query builder library for Node to be used alongside with the `@azure/cosmos` client library.

## Installation

```bash
npm i @heivo/cosmonaut
// or
yarn add @heivo/cosmonaut
// or
pnpm add @heivo/cosmonaut
```

This library has no dependencies and 2 optional peer dependencies:

- `typescript`: while it's possible to use this without Typescript you'd lose many of the benefits that it provides
- `@azure/cosmos`: we only import types from this

## Example usage

Given the type:

```ts
interface Machine {
  id: string;
  serial: string;
  isConnected: boolean;
  price?: number;
  mode: 'idle' | 'running';
  tags: string[];
  softDeleted?: {
    at: string;
    by: string;
  };
}
```

You can can build a query like this:

```ts
import { CosmosQueryBuilder } from '@heivo/cosmonaut';

const { querySpec } = new CosmosQueryBuilder<Machine>()
  .select('id', 'mode', 'serial', 'isConnected')
  .stringMatchesRegex('id', '^0001-abc-.*', { ignoreCase: true })
  .equals('isConnected', true)
  .equals('mode', ['idle', 'running'])
  .lower('price', 100)
  .or((d) => {
    d.isUndefined('softDeleted');
    d.and((c) => {
      c.isDefined('softDeleted');
      c.lower('softDeleted.at', '2023-03-01'); // 👈 nested keys are also supported
    });
  })
  .orderBy('serial')
  .take(10)
  .skip(20)
  .build({ pretty: true });

const { resources } = await container.items.query<Machine>(querySpec);
```

The result is a `SqlQuerySpec` that you can pass to the `Items.query()` function of [Azure Cosmos DB client library](https://www.npmjs.com/package/@azure/cosmos#query-the-database).

```json
{
  "query": "
    SELECT c.id, c.mode, c.serial, c.isConnected
    FROM c
    WHERE RegexMatch(c.id, @id, \"i\")
    AND c.isConnected = true
    AND ARRAY_CONTAINS(@mode, c.mode)
    AND c.price < 100
    AND (
      NOT IS_DEFINED(c.softDeleted)
      OR (
        IS_DEFINED(c.softDeleted)
        AND c.softDeleted.at < @softDeleted_at
      )
    )
    ORDER BY c.serial ASC
    OFFSET 20 LIMIT 10
  ",
  "parameters": [
    { "name": "@id", "value": "^0001-abc-.*" },
    { "name": "@mode", "value": ["idle", "running"] },
    { "name": "@softDeleted_at", "value": "2023-03-01" }
  ]
}
```

Alternatively you can pass the Cosmos container directly to the returned `query()` function and retrieve a well-typed response:

```ts
// resources is of type Pick<Machine, "id" | "mode" | "serial">[]
const { resources } = await new CosmosQueryBuilder<Machine>().select('id', 'mode', 'serial').build().query(container);
```

## API

### Selecting

By default the whole document is selected with `SELECT * from c`. The `select()` function let's you define which fields or paths to query.

```ts
.select('id', 'serial', 'isConnected', 'softDeletd.at')
```

Alternatively you can use any of those aggregation functions:

#### Count

```ts
.selectCount()
.selectCount({ groupBy: 'mode' })
.selectCount({ groupBy: ['mode', 'isConnected'] })
```

#### Min

```ts
.selectMin('price')
.selectMin('price', { groupBy: 'mode' })
.selectMin('price', { groupBy: ['mode', 'isConnected'] })
```

#### Max

```ts
.selectMax('price')
.selectMax('price', { groupBy: 'mode' })
.selectMax('price', { groupBy: ['mode', 'isConnected'] })
```

#### Sum

```ts
.selectSum('price')
.selectSum('price', { groupBy: 'mode' })
.selectSum('price', { groupBy: ['mode', 'isConnected'] })
```

#### Avg

```ts
.selectAvg('price')
.selectAvg('price', { groupBy: 'mode' })
.selectAvg('price', { groupBy: ['mode', 'isConnected'] })
```

### Conditions

#### Equals

`.equals(path: Path, value: PathValue)`

```ts
.equals('id', '00001'); // "id" must be exactly "00001"
.equals('id', ['00001', '00002', '00003']); // "id" must be any of "00001", "00002", "00003"
```

#### Not equals

`.notEquals(path: Path, value: PathValue)`

```ts
.notEquals('id', '00001'); // "id" must not be "00001"
.notEquals('id', ['00001', '00002', '00003']); // "id" may not be any of "00001", "00002", "00003"
```

#### Lower

`.lower(path: Path, value: PathValue)`

```ts
.lower('price', 100); // "price" must be lower than 100
```

#### Lower equals

`.lowerEquals(path: Path, value: PathValue)`

```ts
.lowerEquals('price', 100); // "price" must be lower or equal to 100
```

#### Greater

`.greater(path: Path, value: PathValue)`

```ts
.greater('price', 100); // "price" must be greater than 100
```

#### Greater equals

`.greaterEquals(path: Path, value: PathValue)`

```ts
.greaterEquals('price', 100); // "price" must be greater or equal to 100
```

#### Is defined

`.isDefined(path: Path)`

```ts
.isDefined('price'); // "price" must be defined
```

#### Is undefined

`.isUndefined(path: Path)`

```ts
.isUndefined('price'); // "price" must not be defined
```

#### Is null

`.isNull(path: Path)`

```ts
.isNull('price'); // "price" must be null
```

#### Is not null

`.isNotNull(path: Path)`

```ts
.isNotNull('price'); // "price" must not be null
```

#### String equals

`.stringEquals(path: Path, value: PathValue, ignoreCase?: boolean)`

```ts
.stringEquals('serial', 'a0001'); // "serial" must match exactly "a0001"
.stringEquals('serial', 'a0001', true); // ignore case, "serial" must match exactly "a0001" or "A0001"
```

#### String contains

`.stringContains(path: Path, value: PathValue, ignoreCase?: boolean)`

```ts
.stringContains('serial', 'a0'); // "serial" must contain "a0"
.stringContains('serial', 'a0', true); // ignore case, "serial" must contain "a0" or "A0"
```

#### String starts with

`.stringStartsWith(path: Path, value: PathValue, ignoreCase?: boolean)`

```ts
.stringStartsWith('serial', 'a0'); // "serial" must start with "a0"
.stringStartsWith('serial', 'a0', true); // ignore case, "serial" must start with "a0" or "A0"
```

#### String ends with

`.stringEndsWith(path: Path, value: PathValue, ignoreCase?: boolean)`

```ts
.stringEndsWith('serial', 'a0'); // "serial" must end with "a0"
.stringEndsWith('serial', 'a0', true); // ignore case, "serial" must end with "a0" or "A0"
```

#### String matches regular expression

`.stringMatchesRegex(path: Path, value: PathValue, flags?: { ignoreCase?: boolean, multiline?: boolean, dotAll?: boolean, ignoreWhitespace?: boolean })`

```ts
.stringMatchesRegex('serial', '^a.*'); // "serial" must match the regular expression "^a.*"
```

Optionally you can pass flags as a third argument:

- `ignoreCase`: Ignore case when pattern matching.
- `multiline`: Treat the string expression to be searched as multiple lines. Without this option, "^" and "$" will match at the beginning or end of the string and not each individual line.
- `dotAll`: Allow "." to match any character, including a newline character.
- `ignoreWhitespace`: Ignore all whitespace characters.

e.g.

```ts
.stringMatchesRegex('serial', '^a.*', { ignoreCase: true });
```

#### Array contains

`.arrayContains(path: Path, value: PathValue)`

```ts
.arrayContains('tags', 'new'); // "tags" array must contain "new"
```

### Logical operators

#### Or

`.or((disjunction: NestedCosmosQueryBuilder) => void)`

Can only be used within a nested conjunction (AND) or in the root query builder.

```ts
.or(d => {
  d.equals('id', '123');
  d.equals('serial', '456');
}); // either "id" must be "123" or "serial" must be "456"

// or
.or(d => d.equals('id', '123').equals('serial', '456'));

// or
.or(d => ([d.equals('id', '123'), d.equals('serial', '456')}]);

// or
.or(({equals}) => {
  equals('id', '123');
  equals('serial', '456');
});
```

#### And

`.and((conjunction: NestedCosmosQueryBuilder) => void)`

Can only be used within a nested disjunction (OR).

```ts
.and(c => {
  c.equals('id', '123');
  c.equals('serial', '456');
}); // "id" must be "123" and "serial" must be "456"
```

### Sorting

`.orderBy(path: Path, direction?: 'ASC' | 'DESC')`

```ts
.orderBy('serial'); // order by "serial", default ascending
.orderBy('serial', 'ASC'); // order by "serial" ascending
.orderBy('serial', 'DESC'); // order by "serial" descending
```

### Pagination

Pagination only makes sense in combination with sorting, otherwise the result will be non-deterministic.

#### Take

`.take(value: number)`

```ts
.take(5); // limit the result to 5 items
```

#### Skip

`.skip(value: number)`

```ts
.skip(10); // skip the first 10 entries
```

### Building

```ts
.build(options?: {
  pretty?: boolean, // pretty-prints the query and conditions expression
  noParams? boolean, // inlines all values in the query, this is useful for testing it in the CosmosDB Data Explorer but should not be used in production to avoid SQL injection
}): {
  querySpec: SqlQuerySpec,
  conditionsExpression: string,
  parameters: SqlParameter[],
  query: (container: Container => QueryIterator)
}
```

The `.build()` functions returns an object that has a

- `querySpec: SqlQuerySpec` that can be passed to `Items.query(querySpec)` from the `@azure/cosmos` client library
- `conditionsExpression: string` that can be used to manually construct the full query, use alongside with:
- `parameters: SqlParameter[]`
- `query: (container: Container) => QueryIterator` a function where you pass the `@azure/cosmos` container instance to retrieve a well-typed `QueryIterator`

#### Using `querySpec`

```ts
const container = new CosmosClient('').database('').container('');
const { querySpec } = queryBuilder.build();
const { resources } = await container.items.query<Machine>(querySpec);
```

#### Using `conditionsExpression` and `parameters`

```ts
const container = new CosmosClient('').database('').container('');
const { conditionsExpression, parameters } = queryBuilder.build();
const query = `SELECT c.mode, COUNT(c.id) FROM c WHERE ${conditionsExpression} GROUP BY c.mode`;
const { resources } = await container.items.query<Machine>({ query, parameters }).fetchAll();
```

#### Using `query()`

The problem with the upper two approaches is that you have to manually contruct a type interface that matches the returned resources when using the `.select()` function.

By using the `.query()` function Typescript can automatically infer the right type:

```ts
const container = new CosmosClient('').database('').container('');
const { query } = queryBuilder.select('id', 'mode', 'isConnected').build();
// resources is of type Pick<Machine, "id" | "mode" | "isConnected">[]
const { resources } = await query(container).fetchAll();
// you can also pass options that are forwarded to the container query function
const { resources } = await query(container, { maxItemCount: 100 }).fetchNext();
```
