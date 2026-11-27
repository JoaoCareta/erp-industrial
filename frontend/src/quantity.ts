/** Format database decimals without losing precision through floating-point conversion. */
export function displayQuantity(quantity: string, unit: string) {
  const [whole, decimals = ""] = quantity.split(".");
  const fraction = decimals.replace(/0+$/, "");
  const integer = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return integer + (fraction ? "," + fraction : "") + " " + unit;
}
