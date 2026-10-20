import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import type { FarmActivity } from "@/features/management/api";

export const activityLabels: Record<string, string> = {
  farm_created: "Farm created",
  farm_updated: "Farm details updated",
  farm_deleted: "Farm removed",
  farm_settings_updated: "Farm settings updated",
  block_created: "Housing area added",
  block_updated: "Housing area updated",
  block_deleted: "Housing area removed",
  contact_created: "Contact added",
  contact_updated: "Contact updated",
  contact_deleted: "Contact removed",
  contact_role_created: "Contact role added",
  contact_role_updated: "Contact role updated",
  contact_role_deleted: "Contact role removed",
  contact_role_product_added: "Product added to contact",
  contact_role_product_removed: "Product removed from contact",
  transaction_created: "Transaction recorded",
  transaction_payment_recorded: "Payment recorded",
  purchase_receipt_created: "Purchase received",
  purchase_return_created: "Purchase returned",
  purchase_supplier_refund_recorded: "Supplier refund recorded",
  purchase_replacement_received: "Replacement received",
  chicken_movement_created: "Flock movement recorded",
  chicken_loss_recorded: "Bird loss recorded",
  egg_collection_recorded: "Eggs collected",
  egg_loss_recorded: "Egg loss recorded",
  product_consumption_recorded: "Product use recorded",
  expense_recorded: "Expense recorded",
  notification_created: "Farm update sent",
  sale_delivery_created: "Sale delivered",
  sale_return_created: "Sale return recorded",
  transaction_refund_created: "Customer refund recorded",
  inventory_adjusted: "Stock updated",
  inventory_opening_stock_recorded: "Opening stock recorded",
  transaction_settlement_recorded: "Account settled",
};

export const entityLabels: Record<string, string> = {
  farm: "Farm",
  block: "Housing area",
  contact: "Contact",
  contact_role: "Contact role",
  contact_role_product: "Contact product",
  transaction: "Transaction",
  transaction_payment: "Payment",
  purchase_receipt: "Purchase",
  purchase_return: "Purchase return",
  purchase_supplier_refund: "Supplier refund",
  purchase_replacement: "Replacement",
  chicken_movement: "Flock",
  chicken_loss: "Flock loss",
  egg_collection: "Egg collection",
  egg_loss: "Egg loss",
  product_consumption: "Inventory",
  expense: "Expense",
  sale_delivery: "Sale delivery",
  sale_return: "Sale return",
  transaction_refund: "Refund",
  inventory_movement: "Stock movement",
  inventory_opening_setup: "Opening stock setup",
  transaction_settlement: "Account settlement",
};

export const categoryIcons: Record<
  string,
  keyof typeof Ionicons.glyphMap
> = {
  farm: "business-outline",
  block: "grid-outline",
  contact: "people-outline",
  contact_role: "people-outline",
  contact_role_product: "cube-outline",
  transaction: "cart-outline",
  transaction_payment: "cash-outline",
  purchase_receipt: "bag-handle-outline",
  purchase_return: "return-up-back-outline",
  purchase_supplier_refund: "cash-outline",
  purchase_replacement: "bag-handle-outline",
  chicken_movement: "swap-horizontal-outline",
  chicken_loss: "alert-circle-outline",
  egg_collection: "egg-outline",
  egg_loss: "alert-circle-outline",
  product_consumption: "cube-outline",
  expense: "wallet-outline",
  sale_delivery: "cart-outline",
  sale_return: "return-up-back-outline",
  transaction_refund: "cash-outline",
  inventory_movement: "cube-outline",
  inventory_opening_setup: "file-tray-stacked-outline",
  transaction_settlement: "swap-horizontal-outline",
};

export type ActivityActionTone = "danger" | "success" | "updated";

export const actionTextTones: Record<string, ActivityActionTone> = {
  farm_deleted: "danger",
  block_deleted: "danger",
  contact_deleted: "danger",
  contact_role_deleted: "danger",
  contact_role_product_removed: "danger",
  chicken_loss_recorded: "danger",
  egg_loss_recorded: "danger",
  purchase_return_created: "danger",
  sale_return_created: "danger",
  transaction_refund_created: "danger",
  purchase_supplier_refund_recorded: "danger",
  farm_created: "success",
  block_created: "success",
  contact_created: "success",
  contact_role_created: "success",
  contact_role_product_added: "success",
  transaction_created: "success",
  transaction_payment_recorded: "success",
  purchase_receipt_created: "success",
  purchase_replacement_received: "success",
  chicken_movement_created: "success",
  egg_collection_recorded: "success",
  inventory_opening_stock_recorded: "success",
  product_consumption_recorded: "success",
  expense_recorded: "success",
  sale_delivery_created: "success",
  farm_updated: "updated",
  farm_settings_updated: "updated",
  block_updated: "updated",
  contact_updated: "updated",
  contact_role_updated: "updated",
  notification_created: "updated",
};

export const entityColors: Record<string, string> = {
  farm: "#315F50",
  block: "#286B8A",
  contact: "#694987",
  contact_role: "#A0476D",
  contact_role_product: "#236B68",
  transaction: "#99551B",
  transaction_payment: "#425E9E",
  purchase_receipt: "#7E641A",
  purchase_return: "#A44438",
  purchase_supplier_refund: "#77517F",
  purchase_replacement: "#4F7138",
  chicken_movement: "#3C7555",
  chicken_loss: "#8A5635",
  egg_collection: "#89620F",
  egg_loss: "#7D443B",
  product_consumption: "#387A85",
  expense: "#79502D",
  sale_delivery: "#2D6587",
  sale_return: "#8A3B61",
  transaction_refund: "#3E5274",
  inventory_movement: "#46734D",
  inventory_opening_setup: "#46734D",
  transaction_settlement: "#496378",
};

const detailLabels: Record<string, string> = {
  address: "Address",
  amount: "Amount",
  amount_paid: "Amount paid",
  allocations: "Allocations",
  balance_due: "Balance due",
  batch_name: "Flock batch",
  base_unit_abbreviation: "Base unit",
  base_unit_name: "Base unit",
  block_allocations: "Housing allocations",
  block_name: "Housing area",
  bonus_quantity: "Bonus quantity",
  category: "Category",
  chicken_type: "Bird type",
  collected_at: "Collection date",
  contact_name: "Contact",
  consumption_date: "Use date",
  credit_applied_amount: "Credit used",
  credit_amount: "Credit amount",
  credit_balance: "Credit balance",
  credit_total: "Total credit",
  currency: "Currency",
  delivered_date: "Delivery date",
  description: "Description",
  discount: "Discount",
  discount_amount: "Discount",
  discount_reason: "Discount reason",
  discount_type: "Discount type",
  discount_value: "Discount value",
  email: "Email",
  entry_count: "Entries recorded",
  expense_date: "Expense date",
  field: "Field",
  from_block_name: "From housing area",
  initial_payment_count: "Initial payments",
  item_count: "Items recorded",
  location: "Location",
  loss_date: "Loss date",
  maximum_chicken_capacity: "Maximum flock capacity",
  message: "Message",
  movement_date: "Movement date",
  name: "Name",
  direction: "Direction",
  movement_type: "Stock change",
  occurred_on: "Stock date",
  notes: "Notes",
  over_capacity_limit: "Capacity warning limit",
  payment_date: "Payment date",
  payment_method: "Payment method",
  payment_reference: "Payment reference",
  phone: "Phone",
  phone_number: "Phone",
  primary_color: "Primary color",
  product_name: "Product",
  quantity: "Quantity",
  quantity_delivered: "Quantity delivered",
  quantity_in_base_unit: "Equivalent quantity",
  quantity_in_base_unit_by_product: "Quantity by product",
  quantity_received: "Quantity received",
  quantity_returned: "Quantity returned",
  quantities_by_reason: "Losses by reason",
  reason: "Reason",
  received_date: "Received date",
  recipient_count: "Recipients",
  reference_number: "Reference number",
  refund_date: "Refund date",
  refund_type: "Refund type",
  remaining_inventory_in_base_unit: "Stock remaining",
  remaining_quantity: "Remaining quantity",
  replacement_date: "Replacement date",
  replacement_quantity: "Replacement quantity",
  return_date: "Return date",
  return_reason: "Return reason",
  return_type: "Return type",
  role: "Contact role",
  secondary_color: "Secondary color",
  subtotal: "Subtotal",
  timezone: "Time zone",
  title: "Title",
  to_block_name: "To housing area",
  total: "Line total",
  total_quantity: "Total quantity",
  transaction_date: "Transaction date",
  transaction_reference_number: "Transaction reference",
  transaction_time: "Transaction time",
  transaction_total: "Transaction total",
  transaction_type: "Transaction type",
  unit: "Unit",
  unit_abbreviation: "Unit",
  unit_name: "Unit",
  unit_price: "Unit price",
  value: "Value",
};

const humanizedDetailValues = new Set([
  "payment_method",
  "reason",
  "transaction_type",
  "movement_type",
  "direction",
]);

const moneyFields = new Set([
  "amount",
  "amount_paid",
  "balance_due",
  "credit_balance",
  "credit_amount",
  "credit_applied_amount",
  "credit_total",
  "discount_amount",
  "transaction_total",
  "unit_price",
  "subtotal",
  "total",
]);
const numericFields = new Set([
  ...moneyFields,
  "bonus_quantity",
  "credit_amount",
  "credit_applied_amount",
  "discount",
  "discount_value",
  "maximum_chicken_capacity",
  "over_capacity_limit",
  "quantity",
  "quantity_delivered",
  "quantity_in_base_unit",
  "quantity_received",
  "quantity_returned",
  "remaining_inventory_in_base_unit",
  "remaining_quantity",
  "replacement_quantity",
  "total_quantity",
]);

const isoDateFields = /(^date$|_date$|_at$|^occurred_on$)/;
const internalIdFields = /(^id$|_id$|_ids$)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

function formatQuantity(value: unknown): string {
  if (typeof value !== "number" && typeof value !== "string") return "";
  const quantity = Number(value);
  return Number.isFinite(quantity)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
        quantity,
      )
    : "";
}

function formatMoney(value: unknown): string {
  if (typeof value !== "number" && typeof value !== "string") return "";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : "";
}

function formatUnitName(value: unknown, quantity: unknown): string {
  const unit = stringValue(value);
  if (!unit) return "";
  const count = numberValue(quantity);
  if (count === 1 || /s$/i.test(unit)) return unit;
  return `${unit}s`;
}

export function humanize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getActivityLabel(type: string): string {
  return activityLabels[type] ?? humanize(type);
}

export function getEntityLabel(entityType: string): string {
  return entityLabels[entityType] ?? humanize(entityType);
}

export function getActivityDetail(details: Record<string, unknown> | null): string {
  if (!details) return "";
  for (const key of [
    "reference_number",
    "name",
    "product_name",
    "contact_name",
    "block_name",
  ]) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) {
      return key === "reference_number" ? `Ref ${value.trim()}` : value.trim();
    }
  }
  const quantity = details.quantity ?? details.quantity_in_base_unit;
  if (typeof quantity === "number") {
    const unit = typeof details.unit === "string" ? ` ${details.unit}` : "";
    return `${new Intl.NumberFormat().format(quantity)}${unit}`;
  }
  if (typeof details.entry_count === "number") {
    return `${new Intl.NumberFormat().format(details.entry_count)} entries`;
  }
  const amount = details.transaction_total ?? details.amount;
  if (typeof amount === "number" || typeof amount === "string") {
    const parsedAmount = Number(amount);
    if (Number.isFinite(parsedAmount)) {
      return `Amount ${new Intl.NumberFormat().format(parsedAmount)}`;
    }
  }
  if (typeof details.reason === "string" && details.reason.trim()) {
    return humanize(details.reason);
  }
  return "";
}

export type ActivityDetailField = { label: string; value: string };
export type ActivityChange = {
  field: string;
  from: string;
  to: string;
};
export type ActivityProductTotal = {
  product: string;
  quantity: string;
  unit: string;
};
export type ActivityEntryField = { label: string; value: string };
export type ActivityEntry = {
  number: number;
  title: string;
  subtitle: string | null;
  fields: ActivityEntryField[];
  note: string | null;
};

export function getActivityNarrative(activity: FarmActivity): string {
  const details = activity.details ?? {};
  const name =
    stringValue(details.name) ??
    stringValue(details.product_name) ??
    stringValue(details.contact_name) ??
    stringValue(details.batch_name);
  const reference =
    stringValue(details.reference_number) ??
    stringValue(details.transaction_reference_number);
  const contact = stringValue(details.contact_name);
  const total = formatMoney(details.transaction_total);
  const amount = formatMoney(details.amount);

  switch (activity.type) {
    case "farm_created":
      return `Created the farm${name ? ` ${name}` : ""}.`;
    case "farm_updated":
      return `Updated farm details${name ? ` for ${name}` : ""}.`;
    case "farm_settings_updated":
      return "Updated the farm's settings. The changed values are shown below.";
    case "farm_deleted":
      return `Removed the farm${name ? ` ${name}` : ""}.`;
    case "block_created":
      return `Added the housing area${name ? ` ${name}` : ""}.`;
    case "block_updated":
      return `Updated housing area details${name ? ` for ${name}` : ""}.`;
    case "block_deleted":
      return `Removed the housing area${name ? ` ${name}` : ""}.`;
    case "contact_created": {
      const role = stringValue(details.role);
      return `Added ${name ?? "a contact"}${role ? ` as a ${humanize(role)}` : ""}.`;
    }
    case "contact_updated":
      return `Updated contact information${name ? ` for ${name}` : ""}.`;
    case "contact_deleted":
      return `Removed ${name ?? "a contact"} from the farm's contacts.`;
    case "contact_role_created":
      return `Added the ${humanize(stringValue(details.role) ?? "contact")} role${contact ? ` for ${contact}` : ""}.`;
    case "contact_role_updated":
      return `Updated the contact role${contact ? ` for ${contact}` : ""}.`;
    case "contact_role_deleted":
      return `Removed the ${humanize(stringValue(details.role) ?? "contact")} role${contact ? ` for ${contact}` : ""}.`;
    case "contact_role_product_added":
      return `Made ${stringValue(details.product_name) ?? "a product"} available to ${contact ?? "this contact"}.`;
    case "contact_role_product_removed":
      return `Removed ${stringValue(details.product_name) ?? "a product"} from ${contact ?? "this contact"}.`;
    case "transaction_created": {
      const transactionType =
        details.transaction_type === "purchase" ? "purchase" : "sale";
      return `Recorded ${transactionType}${reference ? ` ${reference}` : ""}${contact ? ` with ${contact}` : ""}${total ? ` for ${total}` : ""}.`;
    }
    case "transaction_payment_recorded":
      return `Recorded a payment${amount ? ` of ${amount}` : ""}${reference ? ` for ${reference}` : ""}${contact ? ` from ${contact}` : ""}.`;
    case "purchase_receipt_created":
      return `Recorded a delivery received${reference ? ` for purchase ${reference}` : ""}.`;
    case "purchase_return_created":
      return `Recorded a return to the supplier${reference ? ` for purchase ${reference}` : ""}.`;
    case "purchase_supplier_refund_recorded":
      return `Recorded a supplier refund${amount ? ` of ${amount}` : ""}${reference ? ` for ${reference}` : ""}.`;
    case "purchase_replacement_received":
      return `Recorded replacement stock received${reference ? ` for purchase ${reference}` : ""}.`;
    case "chicken_movement_created": {
      const quantity = formatQuantity(details.quantity);
      const from = stringValue(details.from_block_name);
      const to = stringValue(details.to_block_name);
      return `Moved ${quantity || "birds"}${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}.`;
    }
    case "chicken_loss_recorded": {
      const count = numberValue(details.total_quantity);
      const itemCount = numberValue(details.item_count) || 1;
      return `Recorded ${formatQuantity(count) || "bird"} bird${count === 1 ? "" : "s"} lost across ${itemCount} ${itemCount === 1 ? "record" : "records"}.`;
    }
    case "egg_collection_recorded": {
      const items = Array.isArray(details.items) ? details.items : [];
      const entries = numberValue(details.entry_count) || items.length;
      const quantities = details.quantity_in_base_unit_by_product;
      const quantity = isRecord(quantities)
        ? Object.values(quantities).reduce<number>(
            (sum, value) => sum + numberValue(value),
            0,
          )
        : items.reduce<number>(
            (sum, item) =>
              sum +
              (isRecord(item) ? numberValue(item.quantity_in_base_unit) : 0),
            0,
          );
      const totals = getActivityProductTotals(details);
      const productNames = new Set(
        items.flatMap((item) => {
          const product = isRecord(item) ? stringValue(item.product_name) : null;
          return product ? [product] : [];
        }),
      );
      const productLabel =
        totals.length === 1
          ? totals[0].product
          : productNames.size === 1
            ? [...productNames][0]
            : "eggs";
      const unit =
        totals.length === 1
          ? ` ${formatUnitName(totals[0].unit, quantity)}`
          : "";
      return `Collected ${formatQuantity(quantity)}${unit} of ${productLabel.toLowerCase()} across ${entries} ${entries === 1 ? "entry" : "entries"}.`;
    }
    case "egg_loss_recorded": {
      const baseUnit =
        stringValue(details.base_unit_name) ??
        stringValue(details.base_unit_abbreviation);
      const quantity = formatQuantity(details.quantity_in_base_unit);
      const unit = formatUnitName(baseUnit, details.quantity_in_base_unit);
      const product = stringValue(details.product_name) ?? "eggs";
      return `Recorded a loss of ${[quantity, unit].filter(Boolean).join(" ")}${unit ? ` of ${product}` : ` ${product}`}.`;
    }
    case "product_consumption_recorded": {
      const unit =
        stringValue(details.unit_name) ??
        stringValue(details.unit_abbreviation);
      const quantity = formatQuantity(details.quantity);
      const formattedUnit = formatUnitName(unit, details.quantity);
      return `Recorded ${[quantity, formattedUnit].filter(Boolean).join(" ")} of ${stringValue(details.product_name) ?? "inventory"} used.`;
    }
    case "expense_recorded":
      return `Recorded a ${humanize(stringValue(details.category) ?? "farm")} expense${amount ? ` of ${amount}` : ""}.`;
    case "notification_created":
      return stringValue(details.title) ?? "Sent a farm update.";
    case "sale_delivery_created":
      return `Recorded a delivery${reference ? ` for sale ${reference}` : ""}.`;
    case "sale_return_created":
      return `Recorded a customer return${reference ? ` for sale ${reference}` : ""}.`;
    case "transaction_refund_created":
      return `Recorded a customer refund${amount ? ` of ${amount}` : ""}${reference ? ` for ${reference}` : ""}.`;
    default:
      return getActivityDetail(details) || `${getActivityLabel(activity.type)}.`;
  }
}

export function getActivityChangeIntro(activity: FarmActivity): string {
  switch (activity.type) {
    case "farm_settings_updated":
      return "Farm settings before and after this update";
    case "farm_updated":
      return "Farm details before and after this update";
    case "block_updated":
      return "Housing details before and after this update";
    case "contact_updated":
      return "Contact details before and after this update";
    case "contact_role_updated":
      return "The contact role before and after this update";
    default:
      return "The previous and updated values";
  }
}

export function getActivityFactsTitle(activity: FarmActivity): string {
  switch (activity.type) {
    case "transaction_created":
      return "Transaction summary";
    case "transaction_payment_recorded":
      return "Payment summary";
    case "purchase_receipt_created":
      return "Receipt summary";
    case "purchase_return_created":
    case "sale_return_created":
      return "Return summary";
    case "purchase_supplier_refund_recorded":
    case "transaction_refund_created":
      return "Refund summary";
    case "purchase_replacement_received":
      return "Replacement summary";
    case "chicken_movement_created":
      return "Movement details";
    case "chicken_loss_recorded":
    case "egg_loss_recorded":
      return "Loss details";
    case "egg_collection_recorded":
      return "Collection details";
    case "product_consumption_recorded":
      return "Usage details";
    case "expense_recorded":
      return "Expense details";
    case "notification_created":
      return "Update details";
    default:
      return "Details";
  }
}

export function getActivityEntriesTitle(activity: FarmActivity): string {
  switch (activity.type) {
    case "transaction_created":
      return "Items on this transaction";
    case "purchase_receipt_created":
      return "Items received";
    case "purchase_return_created":
      return "Items returned";
    case "purchase_replacement_received":
      return "Replacement items";
    case "sale_delivery_created":
      return "Items delivered";
    case "sale_return_created":
      return "Items returned";
    case "chicken_loss_recorded":
      return "Loss records";
    case "egg_collection_recorded":
      return "Collection entries";
    case "egg_loss_recorded":
      return "Loss entries";
    default:
      return "Recorded items";
  }
}

export function getActivityEntries(activity: FarmActivity): ActivityEntry[] {
  const items = activity.details?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    return [formatActivityEntry(activity.type, item, index)];
  });
}

function formatActivityEntry(
  activityType: string,
  item: Record<string, unknown>,
  index: number,
): ActivityEntry {
  const settlementKind =
    activityType === "transaction_settlement_recorded"
      ? stringValue(item.kind)
      : null;
  const title =
    (settlementKind === "cash"
      ? `Cash · ${humanize(stringValue(item.payment_method) ?? "payment")}`
      : settlementKind === "service"
        ? stringValue(item.description)
        : null) ??
    stringValue(item.product_name) ??
    stringValue(item.batch_name) ??
    stringValue(item.chicken_type) ??
    stringValue(item.product) ??
    (activityType === "egg_loss_recorded"
      ? `${stringValue(item.product_name) ?? "Egg"} loss ${index + 1}`
      : activityType === "sale_return_created"
        ? `Return ${index + 1}`
        : `Entry ${index + 1}`);
  const quantity = firstString(item, [
    "quantity",
    "quantity_received",
    "quantity_delivered",
    "quantity_returned",
  ]);
  const unit =
    stringValue(item.unit_name) ?? stringValue(item.unit_abbreviation);
  const lineValue = formatMoney(item.value ?? item.amount);
  const subtitle = settlementKind === "cash"
    ? lineValue
    : settlementKind === "service"
      ? lineValue
      : quantity !== null
        ? `${formatQuantity(quantity)}${unit ? ` ${unit}` : ""}`
        : stringValue(item.block_name);
  const fieldKeys: Record<string, string[]> = {
    transaction_created: ["chicken_type", "unit_price", "subtotal", "discount", "total"],
    egg_collection_recorded: ["block_name"],
    product_consumption_recorded: ["quantity_in_base_unit"],
    purchase_receipt_created: [],
    purchase_return_created: ["credit_amount"],
    purchase_replacement_received: [
      "replacement_quantity",
      "bonus_quantity",
      "credit_applied_amount",
      "chicken_type",
    ],
    chicken_loss_recorded: ["reason", "block_name"],
    sale_delivery_created: ["remaining_quantity"],
    sale_return_created: ["credit_amount"],
    transaction_settlement_recorded: [
      "payment_method",
      "reference_number",
      "agreed_unit_value",
      "discount_amount",
    ],
  };
  const fields = (fieldKeys[activityType] ?? []).flatMap((key) => {
    if (key === "block_name") {
      const blockName = stringValue(item.block_name);
      return blockName
        ? [{ label: detailLabels.block_name, value: blockName }]
        : [];
    }
    const formatted = formatEntryValue(key, item[key], item);
    return formatted
      ? [{ label: detailLabels[key] ?? humanize(key), value: formatted }]
      : [];
  });
  if (settlementKind === "goods") {
    const baseQuantity = formatQuantity(item.quantity_in_base_unit);
    const baseUnit =
      stringValue(item.base_unit_name) ??
      stringValue(item.base_unit_abbreviation);
    if (baseQuantity) {
      fields.push({
        label: "Stock quantity",
        value: [baseQuantity, baseUnit].filter(Boolean).join(" "),
      });
    }
    if (lineValue) fields.push({ label: "Line value", value: lineValue });
  } else if (settlementKind === "service" && lineValue) {
    fields.push({ label: "Service value", value: lineValue });
  }
  fields.push(...formatAllocations(item));
  const placement = item.chicken_placement;
  if (isRecord(placement)) {
    fields.push(...formatAllocations(placement));
  }
  if (
    activityType === "egg_collection_recorded" ||
    activityType === "egg_loss_recorded"
  ) {
    const converted = formatQuantity(item.quantity_in_base_unit);
    const baseUnit =
      stringValue(item.base_unit_name) ??
      stringValue(item.base_unit_abbreviation);
    if (converted && baseUnit) {
      fields.push({
        label: "Quantity in stock unit",
        value: `${converted} ${baseUnit}`,
      });
    }
  }
  return {
    number: index + 1,
    title,
    subtitle,
    fields,
    note: stringValue(item.notes),
  };
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") {
      return typeof value === "number" ? String(value) : stringValue(value);
    }
  }
  return null;
}

function formatEntryValue(
  key: string,
  value: unknown,
  item: Record<string, unknown>,
): string {
  if (value === null || value === undefined || value === "") return "";
  if (
    key === "chicken_type" ||
    key === "reason" ||
    key === "payment_method"
  ) {
    return humanize(String(value));
  }
  if (key === "reference_number") return String(value);
  if (key === "quantity_in_base_unit") {
    const unit =
      stringValue(item.base_unit_name) ??
      stringValue(item.base_unit_abbreviation);
    const quantity = formatQuantity(value);
    return quantity && unit ? `${quantity} ${unit}` : quantity;
  }
  return key.includes("amount") ||
    key === "unit_price" ||
    key === "agreed_unit_value" ||
    key === "subtotal" ||
    key === "total"
    ? formatMoney(value)
    : formatQuantity(value);
}

function formatAllocations(item: Record<string, unknown>): ActivityEntryField[] {
  const allocations = Array.isArray(item.allocations)
    ? item.allocations
    : Array.isArray(item.block_allocations)
      ? item.block_allocations
      : [];
  return allocations.flatMap((allocation, index) => {
    if (!isRecord(allocation)) return [];
    const place = [
      stringValue(allocation.batch_name),
      stringValue(allocation.block_name),
    ]
      .filter(Boolean)
      .join(" · ");
    const quantity = formatQuantity(allocation.quantity);
    const value = [place, quantity].filter(Boolean).join(" · ");
    return value
      ? [
          {
            label: allocations.length > 1 ? `Allocation ${index + 1}` : "Allocated to",
            value,
          },
        ]
      : [];
  });
}

export function getActivityProductTotals(
  details: Record<string, unknown> | null,
): ActivityProductTotal[] {
  const totals = details?.quantity_in_base_unit_by_product;
  if (!isRecord(totals)) return [];
  const units = isRecord(details?.base_unit_by_product)
    ? details.base_unit_by_product
    : {};
  return Object.entries(totals).flatMap(([product, quantity]) => {
    const formattedQuantity = formatQuantity(quantity);
    const unit =
      stringValue(units[product]) ??
      (Array.isArray(details?.items)
        ? details.items.flatMap((item) => {
            if (!isRecord(item) || item.product_name !== product) return [];
            const name = stringValue(item.base_unit_name);
            const abbreviation = stringValue(item.base_unit_abbreviation);
            return name ?? abbreviation ? [name ?? abbreviation!] : [];
          })[0]
        : undefined) ??
      "";
    return formattedQuantity
      ? [{ product, quantity: formattedQuantity, unit }]
      : [];
  });
}

export function getActivityChanges(
  details: Record<string, unknown> | null,
): ActivityChange[] {
  if (!Array.isArray(details?.changes)) return [];
  return details.changes.flatMap((change) => {
    if (!change || typeof change !== "object" || Array.isArray(change)) {
      return [];
    }
    const record = change as Record<string, unknown>;
    if (record.changed === true && typeof record.field === "string") {
      return [
        {
          field: isSensitiveField(record.field)
            ? record.field.toLowerCase().includes("password")
              ? "Password"
              : "Sensitive setting"
            : detailLabels[record.field] ?? humanize(record.field),
          from: "Not recorded",
          to: "Changed",
        },
      ];
    }
    if (
      typeof record.field !== "string" ||
      internalIdFields.test(record.field) ||
      isSensitiveField(record.field)
    ) {
      return [];
    }
    return [
      {
        field: detailLabels[record.field] ?? humanize(record.field),
        from: formatChangeValue(record.field, record.from),
        to: formatChangeValue(record.field, record.to),
      },
    ];
  });
}

const activityDetailKeys: Record<string, string[]> = {
  farm_created: ["location", "description", "timezone"],
  farm_updated: [],
  farm_deleted: [],
  farm_settings_updated: [],
  block_created: ["description", "location", "maximum_chicken_capacity"],
  block_updated: [],
  block_deleted: ["description", "location", "maximum_chicken_capacity"],
  contact_created: ["role", "phone", "email", "address", "notes"],
  contact_updated: [],
  contact_deleted: ["phone", "email", "address"],
  contact_role_created: ["role", "contact_name"],
  contact_role_updated: ["role", "contact_name"],
  contact_role_deleted: ["role", "contact_name"],
  contact_role_product_added: ["contact_name", "product_name", "role"],
  contact_role_product_removed: ["contact_name", "product_name", "role"],
  transaction_created: [
    "transaction_type",
    "transaction_date",
    "transaction_time",
    "contact_name",
    "transaction_total",
    "amount_paid",
    "discount_type",
    "discount_value",
    "discount_amount",
    "discount_reason",
    "notes",
  ],
  transaction_payment_recorded: [
    "contact_name",
    "amount",
    "payment_date",
    "payment_time",
    "payment_method",
    "payment_reference",
    "transaction_total",
    "amount_paid",
    "balance_due",
    "credit_balance",
    "notes",
  ],
  purchase_receipt_created: [
    "received_date",
    "item_count",
    "quantity_received",
    "notes",
  ],
  purchase_return_created: [
    "return_date",
    "return_reason",
    "item_count",
    "quantity",
    "credit_total",
    "notes",
  ],
  purchase_supplier_refund_recorded: [
    "amount",
    "payment_method",
    "refund_date",
    "reference_number",
    "reason",
  ],
  purchase_replacement_received: [
    "replacement_date",
    "item_count",
    "quantity_received",
    "bonus_quantity",
  ],
  chicken_movement_created: [
    "from_block_name",
    "to_block_name",
    "movement_date",
    "notes",
  ],
  chicken_loss_recorded: ["loss_date", "total_quantity"],
  egg_collection_recorded: ["collected_at"],
  egg_loss_recorded: [
    "loss_date",
    "reason",
    "quantity_in_base_unit",
    "remaining_inventory_in_base_unit",
    "notes",
  ],
  product_consumption_recorded: [
    "product_name",
    "quantity",
    "quantity_in_base_unit",
    "consumption_date",
    "block_name",
    "batch_name",
    "notes",
  ],
  expense_recorded: [
    "category",
    "amount",
    "expense_date",
    "payment_method",
    "reference_number",
    "contact_name",
    "notes",
  ],
  notification_created: ["title", "message", "recipient_count"],
  sale_delivery_created: [
    "delivered_date",
    "item_count",
    "quantity_delivered",
    "notes",
  ],
  sale_return_created: [
    "return_type",
    "return_date",
    "reason",
    "item_count",
    "quantity",
    "credit_total",
    "notes",
  ],
  transaction_refund_created: [
    "amount",
    "payment_method",
    "refund_date",
    "reference_number",
    "reason",
  ],
  inventory_adjusted: [
    "product_name",
    "movement_type",
    "direction",
    "quantity",
    "unit_name",
    "occurred_on",
    "reason",
  ],
  inventory_opening_stock_recorded: ["species", "setup_date", "record_count"],
  transaction_settlement_recorded: [
    "direction",
    "settlement_date",
    "total_value",
    "reason",
  ],
};

const hiddenDetailKeys = new Set([
  "product_name",
  "unit_name",
  "unit_abbreviation",
  "base_unit_name",
  "base_unit_abbreviation",
  "item_count",
  "entry_count",
]);

export function getActivityDetailFields(
  activity: FarmActivity,
): ActivityDetailField[] {
  const details = activity.details;
  if (!details) return [];
  const fields: ActivityDetailField[] = [];
  for (const key of activityDetailKeys[activity.type] ?? []) {
    if (hiddenDetailKeys.has(key)) continue;
    const value = details[key];
    if (value === null || value === undefined || value === "") continue;
    const formatted = formatActivityDetailValue(key, value, details);
    if (formatted) {
      const label =
        key === "quantity_in_base_unit" && activity.type === "egg_loss_recorded"
          ? "Quantity lost"
          : detailLabels[key] ?? humanize(key);
      fields.push({ label, value: formatted });
    }
  }
  return fields;
}

function formatActivityDetailValue(
  key: string,
  value: unknown,
  details: Record<string, unknown>,
): string {
  if (key === "quantity_in_base_unit" || key === "remaining_inventory_in_base_unit") {
    const unit =
      stringValue(details.base_unit_name) ??
      stringValue(details.base_unit_abbreviation);
    const quantity = formatQuantity(value);
    return quantity && unit ? `${quantity} ${unit}` : quantity;
  }
  if (key === "quantity") {
    const unit =
      stringValue(details.unit_name) ?? stringValue(details.unit_abbreviation);
    const quantity = formatQuantity(value);
    return quantity && unit ? `${quantity} ${unit}` : quantity;
  }
  if (
    key === "amount" ||
    key === "amount_paid" ||
    key === "balance_due" ||
    key === "credit_balance" ||
    key === "credit_total" ||
    key === "discount_amount" ||
    key === "transaction_total"
  ) {
    return formatMoney(value);
  }
  return formatDetailValue(key, value);
}

function formatDetailValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    return moneyFields.has(key) ? formatMoney(value) : formatQuantity(value);
  }
  if (typeof value !== "string") return "";
  if (humanizedDetailValues.has(key)) return humanize(value);
  if (key === "discount_type" || key === "return_type") return humanize(value);
  if (isoDateFields.test(key)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: value.includes("T") ? "short" : undefined,
      }).format(date);
    }
  }
  if (numericFields.has(key) && /^-?\d+(?:\.\d+)?$/.test(value)) {
    return moneyFields.has(key) ? formatMoney(value) : formatQuantity(value);
  }
  return value;
}

function formatChangeValue(key: string, value: unknown): string {
  if (value == null || value === "") return "Not set";
  if (typeof value === "object") return JSON.stringify(value);
  return formatDetailValue(key, value);
}

function isSensitiveField(value: string): boolean {
  return /password|passphrase|secret|token|credential/i.test(value);
}

export function getActivityRelatedDestination(
  activity: FarmActivity,
): Href | null {
  if (activity.type.endsWith("_deleted")) return null;
  const details = activity.details ?? {};
  if (
    activity.entity_type === "inventory_movement" &&
    typeof details.product_id === "string"
  ) {
    return `/products/${details.product_id}/inventory` as Href;
  }
  if (activity.entity_type === "transaction") {
    if (details.transaction_type === "sale") {
      return `/sales/${activity.entity_id}` as Href;
    }
    if (details.transaction_type === "purchase") {
      return `/purchases/${activity.entity_id}` as Href;
    }
  }
  if (activity.entity_type === "block") {
    return `/(tabs)/blocks/${activity.entity_id}` as Href;
  }
  if (activity.entity_type === "contact") {
    return `/contacts/${activity.entity_id}` as Href;
  }
  if (
    (activity.entity_type === "contact_role" ||
      activity.entity_type === "contact_role_product" ||
      activity.entity_type === "expense") &&
    typeof details.contact_id === "string"
  ) {
    return `/contacts/${details.contact_id}` as Href;
  }
  if (
    (activity.entity_type === "product_consumption" ||
      activity.entity_type === "egg_loss") &&
    typeof details.product_id === "string"
  ) {
    return `/products/${details.product_id}` as Href;
  }
  if (activity.entity_type === "egg_collection" && Array.isArray(details.items)) {
    const productIds = [
      ...new Set(
        details.items.flatMap((item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.product_id === "string"
            ? [item.product_id]
            : [],
        ),
      ),
    ];
    if (productIds.length === 1) {
      return `/products/${productIds[0]}` as Href;
    }
  }
  const transactionId =
    typeof details.transaction_id === "string"
      ? details.transaction_id
      : undefined;
  const transactionType = details.transaction_type;
  if (
    transactionId &&
    (activity.entity_type === "transaction_payment" ||
      activity.entity_type === "transaction_settlement" ||
      activity.entity_type === "sale_delivery" ||
      activity.entity_type === "sale_return" ||
      activity.entity_type === "transaction_refund") &&
    transactionType === "sale"
  ) {
    return `/sales/${transactionId}` as Href;
  }
  if (
    transactionId &&
    (activity.entity_type === "transaction_payment" ||
      activity.entity_type === "transaction_settlement" ||
      activity.entity_type === "purchase_receipt" ||
      activity.entity_type === "purchase_return" ||
      activity.entity_type === "purchase_supplier_refund" ||
      activity.entity_type === "purchase_replacement") &&
    transactionType === "purchase"
  ) {
    return `/purchases/${transactionId}` as Href;
  }
  if (
    (activity.entity_type === "chicken_movement" ||
      activity.entity_type === "chicken_loss") &&
    typeof details.to_block_id === "string"
  ) {
    return `/(tabs)/blocks/${details.to_block_id}` as Href;
  }
  if (
    activity.entity_type === "chicken_loss" &&
    Array.isArray(details.items)
  ) {
    const firstItem = details.items.find(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
    if (typeof firstItem?.block_id === "string") {
      return `/(tabs)/blocks/${firstItem.block_id}` as Href;
    }
  }
  return null;
}

export function getActivityRelatedDestinationLabel(
  activity: FarmActivity,
): string {
  const details = activity.details ?? {};
  if (activity.entity_type === "inventory_movement") return "Open product stock";
  const transactionType = details.transaction_type;
  if (transactionType === "sale" || transactionType === "purchase") {
    return `Open ${transactionType}`;
  }
  if (
    activity.entity_type === "contact_role" ||
    activity.entity_type === "contact_role_product" ||
    activity.entity_type === "expense"
  ) {
    return "Open contact";
  }
  if (
    activity.entity_type === "inventory_movement" ||
    activity.entity_type === "product_consumption" ||
    activity.entity_type === "egg_collection" ||
    activity.entity_type === "egg_loss"
  ) {
    return "Open product";
  }
  if (
    activity.entity_type === "block" ||
    activity.entity_type === "chicken_movement" ||
    activity.entity_type === "chicken_loss"
  ) {
    return "Open housing area";
  }
  return `Open ${getEntityLabel(activity.entity_type).toLowerCase()} record`;
}
