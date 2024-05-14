export function isNumber(value: string) {
  return !isNaN(Number(value)) && !isNaN(parseFloat(value));
}
