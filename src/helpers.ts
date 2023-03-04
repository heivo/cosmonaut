export function unpretty(prettyString: string) {
  return prettyString
    .replace(/\s?\n?\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')');
}
