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
      .equals('id', '123')
      /* .equals('mode', 'idle')
      .arrayContains('tags', 'aaa')
      .equals('price', 123.45) */
      .equals('id', ['0001', '0002'])
      /* .equals('isConnected', true)
      .contains('softDeleted.by', 'ihe')
      .equals('some.deeply.nested.object', 1) */
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
      .select('serial', 'id', 'mode', 'serial');

    expect(querySpec.query).toMatchInlineSnapshot(`
"SELECT c.serial, c.id, c.mode
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
