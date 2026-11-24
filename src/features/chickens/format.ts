export type ChickenCountUnit = "bird" | "chicken";

export function formatChickenCount(
  quantity: number,
  unit: ChickenCountUnit = "chicken",
): string {
  return `${quantity.toLocaleString()} ${unit}${quantity === 1 ? "" : "s"}`;
}
