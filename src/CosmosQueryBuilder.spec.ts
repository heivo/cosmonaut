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
    at: string;
    by: string;
  };
}

describe('CosmosQueryBuilder', () => {
  it('does what I want', () => {
    const { querySpec } = new CosmosQueryBuilder<Machine>()
      //.select('id', 'mode', 'serial', 'isConnected')
      .selectMax('softDeleted.at', { groupBy: ['mode', 'softDeleted.by'] })
      .stringMatchesRegex('id', '^0001-abc-.*', { ignoreCase: true })
      .equals('isConnected', true)
      .equals('mode', ['idle', 'running'])
      .lower('price', 100)
      .or((d) => {
        d.isUndefined('softDeleted');
        d.and((c) => {
          c.isDefined('softDeleted');
          c.lower('softDeleted.at', '2023-03-01');
        });
      })
      .orderBy('serial')
      .take(10)
      .build({ pretty: true, noParams: true });

    expect(querySpec).toMatchInlineSnapshot(`
{
  "parameters": [],
  "query": "SELECT MAX(c.softDeleted.at) as max, c.mode, c.softDeleted.by
FROM c
WHERE RegexMatch(c.id, "^0001-abc-.*", "i")
AND c.isConnected = true
AND ARRAY_CONTAINS(["idle","running"], c.mode)
AND c.price < 100
AND (
  NOT IS_DEFINED(c.softDeleted)
  OR (
    IS_DEFINED(c.softDeleted)
    AND c.softDeleted.at < "2023-03-01"
  )
)
GROUP BY c.mode, c.softDeleted.by",
}
`);
  });

  it.skip('can query', async () => {
    const container = new CosmosClient('').database('').container('');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { resources } = await new CosmosQueryBuilder<Machine>()
      .selectSum('price', { groupBy: ['mode', 'id'] })
      .equals('id', '123')
      .build()
      .query(container)
      .fetchAll();
  });
});
