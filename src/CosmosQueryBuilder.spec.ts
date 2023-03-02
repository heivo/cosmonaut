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
      .select('serial', 'id', 'mode', 'serial', 'tags')
      .equals('id', '123')
      .equals('id', ['0001', '0002'])
      .or(({ equals, and }) => {
        equals('id', '456');
        and(({ isDefined, contains }) => {
          isDefined('id');
          contains('id', 'sfdsfd');
        });
      })
      .orderBy('serial')
      .orderBy('mode', 'DESC')
      .take(10)
      .build({pretty: true});

    expect(querySpec.query).toMatchInlineSnapshot(`
"SELECT c.serial, c.id, c.mode, c.tags
FROM c
WHERE c.id = @id
AND ARRAY_CONTAINS(@id_2, c.id)
AND (
  c.id = @id_3
  OR (
    IS_DEFINED(c.id)
    AND CONTAINS(c.id, @id_4, false)
  )
)
ORDER BY c.serial ASC, c.mode DESC
OFFSET 0 LIMIT 10"
`);

    expect(querySpec.parameters).toMatchInlineSnapshot(`
[
  {
    "name": "@id",
    "value": "123",
  },
  {
    "name": "@id_2",
    "value": [
      "0001",
      "0002",
    ],
  },
  {
    "name": "@id_3",
    "value": "456",
  },
  {
    "name": "@id_4",
    "value": "sfdsfd",
  },
]
`);
  });
});
