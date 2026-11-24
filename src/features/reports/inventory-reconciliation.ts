import type {
  InventoryMovement,
  InventoryOverview,
} from "@/features/management/api";

export type InventoryReconciliation = {
  product_id: string;
  product_name: string;
  product_type: string;
  unit_name: string;
  unit_abbreviation: string;
  currentQuantity: number;
  opening: number;
  received: number;
  out: number;
  expectedClosing: number;
  closing: number;
  periodMovements: InventoryMovement[];
};

export function buildInventoryReconciliation(
  balances: InventoryOverview["items"],
  movements: InventoryMovement[],
  fromDate: string,
  toDate: string,
): InventoryReconciliation[] {
  const products = new Map<string, InventoryReconciliation>();
  for (const balance of balances) {
    products.set(balance.product_id, {
      product_id: balance.product_id,
      product_name: balance.product_name,
      product_type: balance.product_type,
      unit_name: balance.unit_name,
      unit_abbreviation: balance.unit_abbreviation,
      currentQuantity: Number(balance.quantity),
      opening: 0,
      received: 0,
      out: 0,
      expectedClosing: 0,
      closing: 0,
      periodMovements: [],
    });
  }
  for (const movement of movements) {
    if (!products.has(movement.product_id)) {
      products.set(movement.product_id, {
        product_id: movement.product_id,
        product_name: movement.product_name,
        product_type: movement.product_type,
        unit_name: movement.unit_name,
        unit_abbreviation: movement.unit_abbreviation,
        currentQuantity: 0,
        opening: 0,
        received: 0,
        out: 0,
        expectedClosing: 0,
        closing: 0,
        periodMovements: [],
      });
    }
    const product = products.get(movement.product_id)!;
    const date = movement.occurred_on.slice(0, 10);
    const quantity = Number(movement.quantity_delta);
    if (fromDate && date < fromDate) {
      product.opening += quantity;
    } else if (!toDate || date <= toDate) {
      if (movement.movement_type !== "valuation" && quantity !== 0) {
        product.periodMovements.push(movement);
        if (quantity > 0) product.received += quantity;
        else product.out += Math.abs(quantity);
      }
    } else {
      product.closing -= quantity;
    }
  }

  return [...products.values()]
    .map((product) => {
      product.closing += product.currentQuantity;
      product.expectedClosing =
        product.opening + product.received - product.out;
      product.periodMovements.sort(
        (left, right) =>
          right.occurred_on.localeCompare(left.occurred_on) ||
          right.created_at.localeCompare(left.created_at),
      );
      return product;
    })
    .sort((left, right) => left.product_name.localeCompare(right.product_name));
}
