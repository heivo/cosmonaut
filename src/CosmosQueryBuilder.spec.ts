import { CosmosClient } from '@azure/cosmos';
import { CosmosQueryBuilder } from './CosmosQueryBuilder';

interface Machine {
  id: string;
  serial: string;
  isConnected: boolean;
  price?: number;
  mode: 'idle' | 'running' | 'error';
  tags: string[];
  softDeleted?: {
    atDate: string;
    byUser: string;
  };
}

describe('CosmosQueryBuilder', () => {
  it('does what I want', () => {
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
          c.lower('softDeleted.atDate', '2023-03-01');
        });
      })
      .orderBy('serial')
      .take(10)
      .build({ pretty: true });

    expect(querySpec).toMatchInlineSnapshot(`
{
  "parameters": [
    {
      "name": "@id",
      "value": "^0001-abc-.*",
    },
    {
      "name": "@mode",
      "value": [
        "idle",
        "running",
      ],
    },
    {
      "name": "@softDeleted_atDate",
      "value": "2023-03-01",
    },
  ],
  "query": "SELECT c.id, c.mode, c.serial, c.isConnected
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
OFFSET 0 LIMIT 10",
}
`);
  });

  it.skip('can query', async () => {
    const container = new CosmosClient('').database('').container('');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { resources } = await new CosmosQueryBuilder<Machine>()
      .select('id', 'mode', 'isConnected')
      .equals('id', '123')
      .build()
      .query(container)
      .fetchAll();
  });
});
