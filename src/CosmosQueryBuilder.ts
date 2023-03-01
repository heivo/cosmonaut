import { SqlParameter, SqlQuerySpec } from '@azure/cosmos';
import { ArrayElement, DeepRequired, Path, PathValue } from './typeHelpers';

const TAB = '  ';

class BaseQueryBuilder<T extends Record<string, any>> {
  private conditions: Array<{
    expression: string;
    path: string;
    value?: any;
  }> = [];

  protected nestedBuilders: Array<ConjunctionQueryBuilder<T> | DisjunctionQueryBuilder<T>> = [];

  protected connectionType: 'conjunction' | 'disjunction' = 'conjunction';

  constructor() {
    this.equals = this.equals.bind(this);
    this.contains = this.contains.bind(this);
    this.isDefined = this.isDefined.bind(this);
    this.arrayContains = this.arrayContains.bind(this);
    this.containedInArray = this.containedInArray.bind(this);
  }

  equals<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V): this {
    this.addCondition('$path = $value', path, value);
    return this;
  }

  contains<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: V, ignoreCase = false) {
    this.addCondition(`CONTAINS($path, $value, ${ignoreCase})`, path, value);
    return this;
  }

  isDefined<P extends Path<T>>(path: P) {
    this.addCondition('IS_DEFINED($path)', path);
    return this;
  }

  arrayContains<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: ArrayElement<V>) {
    this.addCondition(`ARRAY_CONTAINS($path, $value)`, path, value);
    return this;
  }

  containedInArray<P extends Path<T>, V extends PathValue<T, P>>(path: P, value: Array<V>) {
    this.addCondition(`ARRAY_CONTAINS($value, $path)`, path, value);
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
        const nestedExpression = (nestedBuilder as BaseQueryBuilder<T>).getConditionsExpression(parameters, indention + 1);
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

export class CosmosQueryBuilder<T extends Record<string, any>> extends ConjunctionQueryBuilder<DeepRequired<T>> {
  select<F extends keyof T | '*'>(...fields: F[]): SqlQuerySpec {
    const uniqueFields = fields.includes('*' as F) ? ['*'] : [...new Set(fields)];
    const parameters: SqlParameter[] = [];
    const conditionsExpression = this.getConditionsExpression(parameters);
    return {
      query: `
SELECT ${uniqueFields.map((field) => `c.${String(field)}`).join(', ')}
FROM c
WHERE ${conditionsExpression}`.replace(/^\n/, ''),
      parameters,
    };
  }
}
