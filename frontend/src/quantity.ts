/** Format database decimals without losing precision through floating-point conversion. */
export function displayQuantity(quantity: string, unit: string) {
  const [whole, decimals = ""] = quantity.split(".");
  const fraction = decimals.replace(/0+$/, "");
  const integer = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return integer + (fraction ? "," + fraction : "") + " " + unit;
}

/** Commercial amounts arrive as decimal strings. Preserve every cent even beyond the safe integer range. */
export function minorUnits(value: string): bigint {
  const [whole,fraction=""]=value.replace(/^-/,"").split(".");
  const units=BigInt(whole)*100n+BigInt(fraction.padEnd(2,"0"));
  return value.startsWith("-") ? -units : units;
}

export function formatCents(units: bigint): string {
  const absolute=units<0n ? -units : units;
  return (units<0n ? "-" : "") + (absolute/100n).toLocaleString("pt-BR") + "," + String(absolute%100n).padStart(2,"0");
}
