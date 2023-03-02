import { Container, SqlParameter, SqlQuerySpec } from '@azure/cosmos';
import { ArrayElement, DeepRequired, Path, PathValue } from './typeHelpers';

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
    this.stringRegexMatch = this.stringRegexMatch.bind(this);
    this.stringContains = this.stringContains.bind(this);
    this.stringStartsWith = this.stringStartsWith.bind(this);
    this.stringEndsWith = this.stringEndsWith.bind(this);
    this.arrayContains = this.arrayContains.bind(this);
  }

  equals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V | V[]): this {
    if (Array.isArray(value)) {
      this.addCondition(`ARRAY_CONTAINS($value, $path)`, path, value);
    } else {
      this.addCondition('$path = $value', path, value);
    }
    return this;
  }

  notEquals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V | V[]): this {
    if (Array.isArray(value)) {
      this.addCondition(`NOT ARRAY_CONTAINS($value, $path)`, path, value);
    } else {
      this.addCondition('$path != $value', path, value);
    }
    return this;
  }

  lower<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V): this {
    this.addCondition('$path < $value', path, value);
    return this;
  }

  lowerEquals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V): this {
    this.addCondition('$path <= $value', path, value);
    return this;
  }

  greater<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V): this {
    this.addCondition('$path > $value', path, value);
    return this;
  }

  greaterEquals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V): this {
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

  stringEquals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V & string, ignoreCase = false) {
    this.addCondition(`STRINGEQUALS($path, $value, ${ignoreCase})`, path, value);
    return this;
  }

  stringRegexMatch<P extends Path<T>, V extends PathValue<T, P>>(
    path: P,
    value: V & string,
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

  stringContains<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V & string, ignoreCase = false) {
    this.addCondition(`CONTAINS($path, $value, ${ignoreCase})`, path, value);
    return this;
  }

  stringStartsWith<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V & string, ignoreCase = false) {
    this.addCondition(`STARTSWITH($path, $value, ${ignoreCase})`, path, value);
    return this;
  }

  stringEndsWith<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V & string, ignoreCase = false) {
    this.addCondition(`ENDSWITH($path, $value, ${ignoreCase})`, path, value);
    return this;
  }

  arrayContains<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: ArrayElement<V>) {
    this.addCondition(`ARRAY_CONTAINS($path, $value)`, path, value);
    return this;
  }

  private addCondition<P extends Path<T>, V extends PathValue<T, P>>(
    expression: string,
    path: P,
    value?: V | Array<V> | ArrayElement<V>
  ) {
    this.conditions.push({ expression, path: String(path), value });
  }

  protected getConditionsExpression(parameters: SqlParameter[], indention = 0): string {
    return [
      ...this.conditions.map(({ expression, path, value }) => {
        return expression
          .replace('$path', `c.${path}`)
          .replace('$value', () => this.getValueOrParamName(path, value, parameters));
      }),
      ...this.nestedBuilders.map((nestedBuilder) => {
        const nestedExpression = (nestedBuilder as BaseQueryBuilder<T>).getConditionsExpression(
          parameters,
          indention + 1
        );
        return `(\n${TAB.repeat(indention + 1)}${nestedExpression}\n${TAB.repeat(indention)})`;
      }),
    ].join(`\n${TAB.repeat(indention)}${this.connectionType === 'conjunction' ? 'AND' : 'OR'} `);
  }

  private getValueOrParamName(path: string, value: any | undefined, parameters: SqlParameter[]) {
    if (value === undefined || typeof value === 'boolean' || typeof value === 'number') {
      return String(value);
    } else {
      const baseName = `@${path.replace(/\./g, '_')}`;
      let paramName = baseName;
      let counter = 1;
      while (parameters.some((p) => p.name === paramName)) {
        paramName = `${baseName}_${++counter}`;
      }
      parameters.push({ name: paramName, value });
      return paramName;
    }
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
  S extends Pick<T, any> = T
> extends ConjunctionQueryBuilder<DeepRequired<T>> {
  private selection: string[] = [];
  private sorting: Array<{ by: string; order: SortOrder }> = [];
  private pagination: { take?: number; skip?: number } = {};

  constructor() {
    super();
    this.select = this.select.bind(this);
    this.orderBy = this.orderBy.bind(this);
    this.take = this.take.bind(this);
    this.skip = this.skip.bind(this);
    this.query = this.query.bind(this);
  }

  select<F extends keyof T, NewS extends Pick<S, F>>(...fields: F[]): CosmosQueryBuilder<T, NewS> {
    this.selection.push(...(fields as string[]));
    // @ts-ignore
    return this;
  }

  orderBy<P extends Path<DeepRequired<T>>>(by: P, order: SortOrder = 'ASC'): this {
    this.sorting.push({ by: String(by), order });
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

  build({ pretty = false }: { pretty?: boolean } = {}): SqlQuerySpec {
    const selectFields = this.selection.length
      ? [...new Set(this.selection)].map((field) => `c.${field}`).join(', ')
      : '*';
    let query = `SELECT ${selectFields}\nFROM c`;

    const parameters: SqlParameter[] = [];
    const conditionsExpression = this.getConditionsExpression(parameters);
    if (conditionsExpression.length) {
      query += `\nWHERE ${conditionsExpression}`;
    }

    if (this.sorting.length) {
      const sortExpression = this.sorting.map(({ by: path, order }) => `c.${path} ${order}`).join(', ');
      query += `\nORDER BY ${sortExpression}`;
    }

    if (this.pagination.skip || this.pagination.take) {
      query += `\nOFFSET ${this.pagination.skip ?? 0} LIMIT ${this.pagination.take ?? 999999999}`;
    }

    if (!pretty) {
      query = query
        .replace(/\s?\n?\s+/g, ' ')
        .replace(/\( /g, '(')
        .replace(/ \)/g, ')');
    }

    return {
      query,
      parameters,
    };
  }

  query(container: Container) {
    const querySpec = this.build();
    return container.items.query<S>(querySpec);
  }
}
