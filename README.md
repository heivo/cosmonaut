# Cosmonaut

A type-safe CosmosDB query builder library for Node.

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

You can can write a query like this:

```ts
const querySpec = new CosmosQueryBuilder<Machine>()
  .select('id', 'mode', 'serial', 'isConnected')
  .stringMatchesRegex('id', '^0001-abc-.*', { ignoreCase: true })
  .equals('isConnected', true)
  .equals('mode', ['idle', 'running'])
  .lower('price', 100)
  .or((d) => {
    d.isUndefined('softDeleted');
    d.and((c) => {
      c.isDefined('softDeleted');
      c.lower('softDeleted.atDate', '2023-03-01'); // 👈 nested keys are also supported
    });
  })
  .orderBy('serial')
  .take(10)
  .skip(20)
  .build({ pretty: true });
```

The result is a `QuerySpec` that you can pass to the `Items.query()` function of [Azure Cosmos DB client library](https://www.npmjs.com/package/@azure/cosmos).

```json
{
  "query": `
    SELECT c.id, c.mode, c.serial, c.isConnected
    FROM c
    WHERE RegexMatch(c.id, @id, "i")
    AND c.isConnected = true
    AND ARRAY_CONTAINS(@mode, c.mode)
    AND c.price < 100
    AND (
      NOT IS_DEFINED(c.softDeleted)
      OR (
        IS_DEFINED(c.softDeleted)
        AND c.softDeleted.atDate < @softDeleted_atDate
      )
    )
    ORDER BY c.serial ASC
    OFFSET 20 LIMIT 10
  `,
  "parameters": [
    { "name": "@id", "value": "^0001-abc-.*" },
    { "name": "@mode", "value": ["idle", "running"] },
    { "name": "@softDeleted_atDate", "value": "2023-03-01" }
  ]
}
```

```ts
const { resources } = await container.items.query<Machine>(querySpec);
```

Alternatively you can pass the Cosmos container directly to the query builders `query()` function and retrieve a well-typed response:

```ts
// resources is of type Pick<Machine, "id" | "mode" | "serial">[]
const { resources } = await new CosmosQueryBuilder<Machine>().select('id', 'mode', 'serial').query(container);
```

## API

### Selecting

By default the whole document is selected with `SELECT * from c`. The `select()` function let's you defined which fields to query. As of now it is only possible to pass root keys here, nested keys are not supported yet.

```ts
.select('id', 'serial', 'isConnected')
```

### Conditions

#### Equals

`.equals(path, value)`

```ts
.equals('id', '00001'); // "id" must be exactly "00001"
.equals('id', ['00001', '00002', '00003']); // "id" must be any of "00001", "00002", "00003"
```

#### Not equals

`.notEquals(path, value)`

```ts
.notEquals('id', '00001'); // "id" must not be "00001"
.notEquals('id', ['00001', '00002', '00003']); // "id" may not be any of "00001", "00002", "00003"
```

#### Lower

`.lower(path, value)`

```ts
.lower('price', 100); // "price" must be lower than 100
```

#### Lower equals

`.lowerEquals(path, value)`

```ts
.lowerEquals('price', 100); // "price" must be lower or equal to 100
```

#### Greater

`.greater(path, value)`

```ts
.greater('price', 100); // "price" must be greater than 100
```

#### Greater equals

`.greaterEquals(path, value)`

```ts
.greaterEquals('price', 100); // "price" must be greater or equal to 100
```

#### Is defined

`.isDefined(path)`

```ts
.isDefined('price'); // "price" must be defined
```

#### Is undefined

`.isUndefined(path)`

```ts
.isUndefined('price'); // "price" must not be defined
```

#### Is null

`.isNull(path)`

```ts
.isNull('price'); // "price" must be null
```

#### Is not null

`.isNotNull(path)`

```ts
.isNotNull('price'); // "price" must not be null
```

#### String equals

`.stringEquals(path, value, ignoreCase)`

```ts
.stringEquals('serial', 'a0001'); // "serial" must match exactly "a0001"
.stringEquals('serial', 'a0001', true); // ignore case, "serial" must match exactly "a0001" or "A0001"
```

#### String contains

`.stringContains(path, value, ignoreCase)`

```ts
.stringContains('serial', 'a0'); // "serial" must contain "a0"
.stringContains('serial', 'a0', true); // ignore case, "serial" must contain "a0" or "A0"
```

#### String starts with

`.stringStartsWith(path, value, ignoreCase)`

```ts
.stringStartsWith('serial', 'a0'); // "serial" must start with "a0"
.stringStartsWith('serial', 'a0', true); // ignore case, "serial" must start with "a0" or "A0"
```

#### String ends with

`.stringEndsWith(path, value, ignoreCase)`

```ts
.stringEndsWith('serial', 'a0'); // "serial" must end with "a0"
.stringEndsWith('serial', 'a0', true); // ignore case, "serial" must end with "a0" or "A0"
```

#### String matches regular expression

`.stringMatchesRegex(path, value, ignoreCase)`

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

`.arrayContains(path, value)`

```ts
.arrayContains('tags', 'new'); // "tags" array must contain "new"
```

### Logical operators

#### Or

`.or(disjunction => void)`

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

`.and(conjunction => void)`

Can only be used within a nested disjunction (OR).

```ts
.and(c => {
  c.equals('id', '123');
  c.equals('serial', '456');
}); // "id" must be "123" and "serial" must be "456"
```

### Sorting

`.orderBy(path, direction)`

```ts
.orderBy('serial'); // order by "serial", default ascending
.orderBy('serial', 'ASC'); // order by "serial" ascending
.orderBy('serial', 'DESC'); // order by "serial" descending
```

### Pagination

Pagination only makes sense in combination with sorting, otherwise the result will be non-deterministic.

#### Take

`.take(value)`

```ts
.take(5); // limit the result to 5 items
```

#### Skip

`.skip(value)`

```ts
.skip(10); // skip the first 10 entries
```

### Querying

You can either use the `build()` function to create a `QuerySpec` that can be passed to the `Items.query(querySpec)` function or use the `query(container)` function to execute the query and retrieve a well-typed response.

#### Build query spec

`.build(options)`

```ts
const querySpec = build({ pretty: true }); // pretty-prints the SQL
const querySpec = build({ noParams: true }); // inlines all values in the query, this is useful for testing it in the CosmosDB Data Explorer but should not be used in production to avoid SQL injection
```

#### Execute the query

`.query(container)`

```ts
const container = new CosmosClient('').database('').container('');

// resources is of type Pick<Machine, "id" | "mode" | "isConnected">[]
const { resources } = await new CosmosQueryBuilder<Machine>()
  .select('id', 'mode', 'isConnected')
  .query(container)
  .fetchAll();
```
