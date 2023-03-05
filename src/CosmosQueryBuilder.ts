import type { Container, SqlParameter, SqlQuerySpec, JSONValue } from '@azure/cosmos';
import { unpretty } from './helpers';
import type { ArrayElement, Path, PathValue } from './typeHelpers';

const TAB = '  ';

class BaseQueryBuilder<T extends Record<string, any>> {
  private conditions: Array<{ expression: string; path: string; value?: any }> = [];
  protected nestedBuilders: Array<ConjunctionQueryBuilder<T> | DisjunctionQueryBuilder<T>> = [];
  protected connectionType: 'conjunction' | 'disjunction' = 'conjunction';

  constructor() {
    this.equals = this.equals.bind(this);
    this.notEquals = this.notEquals.bind(this);
    this.lower = this.lower.bind(this);
    this.lowerEquals = this.lowerEquals.bind(this);
    this.greater = this.greater.bind(this);
    this.greaterEquals = this.greaterEquals.bind(this);
    this.isDefined = this.isDefined.bind(this);
    this.isUndefined = this.isUndefined.bind(this);
    this.isNull = this.isNull.bind(this);
    this.isNotNull = this.isNotNull.bind(this);
    this.stringEquals = this.stringEquals.bind(this);
    this.stringContains = this.stringContains.bind(this);
    this.stringStartsWith = this.stringStartsWith.bind(this);
    this.stringEndsWith = this.stringEndsWith.bind(this);
    this.stringMatchesRegex = this.stringMatchesRegex.bind(this);
    this.arrayContains = this.arrayContains.bind(this);
  }

  equals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V | V[]) {
    if (Array.isArray(value)) {
      this.addCondition(`ARRAY_CONTAINS($value, $path)`, path, value);
    } else {
      this.addCondition('$path = $value', path, value);
    }
    return this;
  }

  notEquals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V | V[]) {
    if (Array.isArray(value)) {
      this.addCondition(`NOT ARRAY_CONTAINS($value, $path)`, path, value);
    } else {
      this.addCondition('$path != $value', path, value);
    }
    return this;
  }

  lower<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V) {
    this.addCondition('$path < $value', path, value);
    return this;
  }

  lowerEquals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V) {
    this.addCondition('$path <= $value', path, value);
    return this;
  }

  greater<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V) {
    this.addCondition('$path > $value', path, value);
    return this;
  }

  greaterEquals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V) {
    this.addCondition('$path >= $value', path, value);
    return this;
  }

  isDefined<P extends Path<T>>(path: P) {
    this.addCondition('IS_DEFINED($path)', path);
    return this;
  }

  isUndefined<P extends Path<T>>(path: P) {
    this.addCondition('NOT IS_DEFINED($path)', path);
    return this;
  }

  isNull<P extends Path<T>>(path: P) {
    this.addCondition('IS_NULL($path)', path);
    return this;
  }

  isNotNull<P extends Path<T>>(path: P) {
    this.addCondition('NOT IS_NULL($path)', path);
    return this;
  }

  stringEquals<P extends Exclude<Path<T>, NonNullable<V> extends string ? never : P>, V extends PathValue<T, P>>(
    path: P,
    value: V,
    ignoreCase = false
  ) {
    this.addCondition(`STRINGEQUALS($path, $value, ${String(ignoreCase)})`, path, value);
    return this;
  }

  stringContains<P extends Exclude<Path<T>, NonNullable<V> extends string ? never : P>, V extends PathValue<T, P>>(
    path: P,
    value: V & string,
    ignoreCase = false
  ) {
    this.addCondition(`CONTAINS($path, $value, ${String(ignoreCase)})`, path, value);
    return this;
  }

  stringStartsWith<P extends Exclude<Path<T>, NonNullable<V> extends string ? never : P>, V extends PathValue<T, P>>(
    path: P,
    value: V & string,
    ignoreCase = false
  ) {
    this.addCondition(`STARTSWITH($path, $value, ${String(ignoreCase)})`, path, value);
    return this;
  }

  stringEndsWith<P extends Exclude<Path<T>, NonNullable<V> extends string ? never : P>, V extends PathValue<T, P>>(
    path: P,
    value: V & string,
    ignoreCase = false
  ) {
    this.addCondition(`ENDSWITH($path, $value, ${String(ignoreCase)})`, path, value);
    return this;
  }

  stringMatchesRegex<P extends Exclude<Path<T>, NonNullable<V> extends string ? never : P>, V extends PathValue<T, P>>(
    path: P,
    value: V,
    {
      ignoreCase = false,
      multiline = false,
      dotAll = false,
      ignoreWhitespace = false,
    }: { ignoreCase?: boolean; multiline?: boolean; dotAll?: boolean; ignoreWhitespace?: boolean } = {}
  ) {
    const flags = `${ignoreCase ? 'i' : ''}${multiline ? 'm' : ''}${dotAll ? 's' : ''}${ignoreWhitespace ? 'x' : ''}`;
    this.addCondition(`RegexMatch($path, $value, "${flags}")`, path, value);
    return this;
  }

  arrayContains<P extends Exclude<Path<T>, NonNullable<V> extends any[] ? never : P>, V extends PathValue<T, P>>(
    path: P,
    value: ArrayElement<V>
  ) {
    this.addCondition(`ARRAY_CONTAINS($path, $value)`, path, value);
    return this;
  }

  private addCondition<P extends Path<T>, V extends PathValue<T, P>>(
    expression: string,
    path: P,
    value?: V | Array<V> | ArrayElement<V>
  ) {
    this.conditions.push({ expression, path: `c.${String(path)}`, value });
  }

  protected getConditionsExpression(
    noParams = false,
    parameters: SqlParameter[] = [],
    indention = 0
  ): { conditionsExpression: string; parameters: SqlParameter[] } {
    const conditionsExpression = [
      ...this.conditions.map(({ expression, path, value }) => {
        return expression
          .replace('$path', path)
          .replace('$value', () =>
            noParams || value === undefined || typeof value === 'boolean' || typeof value === 'number'
              ? JSON.stringify(value)
              : this.getParamName(path, value, parameters)
          );
      }),
      ...this.nestedBuilders.map((nestedBuilder) => {
        const { conditionsExpression: nestedConditionsExpression } = (
          nestedBuilder as BaseQueryBuilder<T>
        ).getConditionsExpression(noParams, parameters, indention + 1);
        return `(\n${TAB.repeat(indention + 1)}${nestedConditionsExpression}\n${TAB.repeat(indention)})`;
      }),
    ].join(`\n${TAB.repeat(indention)}${this.connectionType === 'conjunction' ? 'AND' : 'OR'} `);

    return { conditionsExpression, parameters };
  }

  private getParamName(path: string, value: any, parameters: SqlParameter[]) {
    const baseName = `@${path.replace(/^c\./, '').replace(/\./g, '_')}`;
    let paramName = baseName;
    let counter = 1;
    while (parameters.some((p) => p.name === paramName)) {
      paramName = `${baseName}_${++counter}`;
    }
    parameters.push({ name: paramName, value: value as JSONValue });
    return paramName;
  }
}

class ConjunctionQueryBuilder<T extends Record<string, any>> extends BaseQueryBuilder<T> {
  constructor() {
    super();
    this.connectionType = 'conjunction';
    this.or = this.or.bind(this);
  }

  or(applyDisjunction: (disjunction: DisjunctionQueryBuilder<T>) => void) {
    const disjunctionBuilder = new DisjunctionQueryBuilder<T>();
    applyDisjunction(disjunctionBuilder);
    this.nestedBuilders.push(disjunctionBuilder);
    return this;
  }
}

class DisjunctionQueryBuilder<T extends Record<string, any>> extends BaseQueryBuilder<T> {
  constructor() {
    super();
    this.connectionType = 'disjunction';
    this.and = this.and.bind(this);
  }

  and(applyConjunction: (conjunction: ConjunctionQueryBuilder<T>) => void) {
    const conjunctionBuilder = new ConjunctionQueryBuilder<T>();
    applyConjunction(conjunctionBuilder);
    this.nestedBuilders.push(conjunctionBuilder);
    return this;
  }
}

type SortOrder = 'ASC' | 'DESC';

export class CosmosQueryBuilder<
  T extends Record<string, any>,
  S extends Pick<T, any> | Record<string, any> = T
> extends ConjunctionQueryBuilder<T> {
  private selection: string[] = [];
  private sorting: Array<{ by: string; order: SortOrder }> = [];
  private pagination: { take?: number; skip?: number } = {};
  private grouping: string[] = [];

  constructor() {
    super();
    this.select = this.select.bind(this);
    this.selectCount = this.selectCount.bind(this);
    this.selectMin = this.selectMin.bind(this);
    this.selectMax = this.selectMax.bind(this);
    this.selectSum = this.selectSum.bind(this);
    this.selectAvg = this.selectAvg.bind(this);
    this.groupBy = this.groupBy.bind(this);
    this.orderBy = this.orderBy.bind(this);
    this.take = this.take.bind(this);
    this.skip = this.skip.bind(this);
    this.build = this.build.bind(this);
  }

  select<F extends keyof T, NewS extends Pick<S, F>>(...fields: F[]): CosmosQueryBuilder<T, NewS> {
    this.selection = fields.map((f) => `c.${String(f)}`);
    // @ts-ignore required for well-typed response when using the query() function
    return this;
  }

  selectCount<GroupBy extends Path<T>, NewS extends Pick<T, GroupBy> & { count: number }>({
    groupBy,
  }: { groupBy?: GroupBy | GroupBy[] } = {}): CosmosQueryBuilder<T, NewS> {
    this.selection = ['count(1) as count'];
    this.groupBy(groupBy);
    // @ts-ignore required for well-typed response when using the query() function
    return this;
  }

  selectMax<P extends Path<T>, GroupBy extends Path<T>, NewS extends Pick<T, GroupBy> & { max: PathValue<T, P> }>(
    path: P,
    { groupBy }: { groupBy?: GroupBy | GroupBy[] } = {}
  ): CosmosQueryBuilder<T, NewS> {
    this.selection = [`MAX(c.${String(path)}) as max`];
    this.groupBy(groupBy);
    // @ts-ignore required for well-typed response when using the query() function
    return this;
  }

  selectMin<P extends Path<T>, GroupBy extends Path<T>, NewS extends Pick<T, GroupBy> & { min: PathValue<T, P> }>(
    path: P,
    { groupBy }: { groupBy?: GroupBy | GroupBy[] } = {}
  ): CosmosQueryBuilder<T, NewS> {
    this.selection = [`MIN(c.${String(path)}) as min`];
    this.groupBy(groupBy);
    // @ts-ignore required for well-typed response when using the query() function
    return this;
  }

  selectSum<
    P extends Exclude<Path<T>, NonNullable<PathValue<T, P>> extends number ? never : P>,
    GroupBy extends Path<T>,
    NewS extends Pick<T, GroupBy> & { sum: PathValue<T, P> }
  >(path: P, { groupBy }: { groupBy?: GroupBy | GroupBy[] } = {}): CosmosQueryBuilder<T, NewS> {
    this.selection = [`SUM(c.${String(path)}) as sum`];
    this.groupBy(groupBy);
    // @ts-ignore required for well-typed response when using the query() function
    return this;
  }

  selectAvg<
    P extends Exclude<Path<T>, NonNullable<PathValue<T, P>> extends number ? never : P>,
    GroupBy extends Path<T>,
    NewS extends Pick<T, GroupBy> & { avg: PathValue<T, P> }
  >(path: P, { groupBy }: { groupBy?: GroupBy | GroupBy[] } = {}): CosmosQueryBuilder<T, NewS> {
    this.selection = [`AVG(c.${String(path)}) as min`];
    this.groupBy(groupBy);
    // @ts-ignore required for well-typed response when using the query() function
    return this;
  }

  private groupBy<GroupBy extends Path<T>>(groupBy?: GroupBy | GroupBy[]) {
    if (typeof groupBy === 'string') {
      this.selection.push(`c.${groupBy}`);
      this.grouping.push(`c.${groupBy}`);
    } else if (Array.isArray(groupBy)) {
      this.selection.push(...groupBy.map((g) => `c.${String(g)}`));
      this.grouping.push(...groupBy.map((g) => `c.${String(g)}`));
    }
  }

  orderBy<P extends Path<T>>(by: P, order: SortOrder = 'ASC') {
    this.sorting.push({ by: `c.${String(by)}`, order });
    return this;
  }

  take(take: number) {
    this.pagination.take = take;
    return this;
  }

  skip(skip: number) {
    this.pagination.skip = skip;
    return this;
  }

  build({
    pretty = false,
    noParams = false,
  }: {
    /** Pretty-print the query */
    pretty?: boolean;
    /**
     * Inline all values within the query, useful for testing it in the CosmosDB Data Explorer
     *
     * Warning: should not be used in production to avoid SQL injection
     */
    noParams?: boolean;
  } = {}) {
    const selectFields = this.selection.length ? [...new Set(this.selection)].join(', ') : '*';
    let query = `SELECT ${selectFields}\nFROM c`;

    // eslint-disable-next-line prefer-const
    let { conditionsExpression, parameters } = this.getConditionsExpression(noParams);
    if (conditionsExpression.length) {
      query += `\nWHERE ${conditionsExpression}`;
    }

    if (this.grouping.length) {
      query += `\nGROUP BY ${this.grouping.join(', ')}`;
    }

    if (this.sorting.length) {
      if (this.grouping.length) {
        console.warn('sorting cannot be used when using an aggregation query, ignoring it');
      } else {
        const sortExpression = this.sorting.map(({ by: path, order }) => `${path} ${order}`).join(', ');
        query += `\nORDER BY ${sortExpression}`;
      }
    }

    if (this.pagination.skip || this.pagination.take) {
      if (this.grouping.length) {
        console.warn('pagination cannot be used when using an aggregation query, ignoring it');
      } else {
        query += `\nOFFSET ${this.pagination.skip ?? 0} LIMIT ${this.pagination.take ?? 999999999}`;
      }
    }

    if (!pretty) {
      query = unpretty(query);
      conditionsExpression = unpretty(conditionsExpression);
    }

    const querySpec: SqlQuerySpec = { query, parameters };

    return {
      querySpec,
      conditionsExpression,
      parameters,
      query: (container: Container) => container.items.query<S>(querySpec),
    };
  }
}
