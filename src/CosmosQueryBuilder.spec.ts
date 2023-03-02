import { CosmosClient } from '@azure/cosmos';
import { CosmosQueryBuilder } from './CosmosQueryBuilder';

interface Asset {
  id: string;
  serial: number;
  isConnected: boolean;
  mode: 'idle' | 'running';
  softDeleted?: {
    by: string;
    at: string;
  };
  price: number;
  optional?: boolean;
  tags: string[];
  some: {
    deeply: {
      nested: {
        object: number;
      };
    };
  };
}

describe('CosmosQueryBuilder', () => {
  it('does what I want', () => {
    const querySpec = new CosmosQueryBuilder<Asset>()
      .select('id', 'mode', 'serial')
      .stringContains('id', '')
      .equals('id', '123')
      .equals('id', ['0001', '0002'])
      .or(({ equals, and }) => {
        equals('id', '456');
        and(({ isDefined, stringContains }) => {
          isDefined('id');
          stringContains('id', 'sfdsfd');
        });
      })
      .stringRegexMatch('id', '^hello.*', { ignoreCase: true, ignoreWhitespace: true })
      .orderBy('serial')
      .orderBy('mode', 'DESC')
      .take(10)
      .build({ pretty: true });

    expect(querySpec).toMatchInlineSnapshot(`
{
  "parameters": [
    {
      "name": "@id",
      "value": "",
    },
    {
      "name": "@id_2",
      "value": "123",
    },
    {
      "name": "@id_3",
      "value": [
        "0001",
        "0002",
      ],
    },
    {
      "name": "@id_4",
      "value": "^hello.*",
    },
    {
      "name": "@id_5",
      "value": "456",
    },
    {
      "name": "@id_6",
      "value": "sfdsfd",
    },
  ],
  "query": "SELECT c.id, c.mode, c.serial
FROM c
WHERE CONTAINS(c.id, @id, false)
AND c.id = @id_2
AND ARRAY_CONTAINS(@id_3, c.id)
AND RegexMatch(c.id, @id_4, "ix")
AND (
  c.id = @id_5
  OR (
    IS_DEFINED(c.id)
    AND CONTAINS(c.id, @id_6, false)
  )
)
ORDER BY c.serial ASC, c.mode DESC
OFFSET 0 LIMIT 10",
}
`);
  });

  it.skip('can query', async () => {
    const container = new CosmosClient('').database('').container('');
    const { resources } = await new CosmosQueryBuilder<Asset>()
      .select('id', 'mode', 'isConnected')
      .equals('id', '123')
      .query(container)
      .fetchAll();
  });
});
