import type { Href } from "expo-router";

const allowedAssistantRoutes = new Set([
  "/(tabs)",
  "/(tabs)/account",
  "/settings",
  "/sales",
  "/sales/new",
  "/chicken-sale",
  "/chicken-movement",
  "/contacts",
  "/contacts/new",
  "/inventory",
  "/inventory/purchase",
  "/inventory/opening-stock",
  "/inventory/consumption",
  "/(tabs)/blocks",
  "/(tabs)/blocks/new",
  "/(tabs)/flock",
  "/(tabs)/eggs",
  "/chicken-purchase",
  "/chicken-loss",
  "/egg-collection",
  "/egg-loss",
  "/egg-sale",
  "/reports",
  "/reports/stock-costing",
  "/expenses",
  "/purchases",
  "/receipts",
  "/products",
  "/products/new",
  "/units",
  "/farm-setup",
  "/farm-team",
  "/activities",
  "/notifications",
  "/reminders",
  "/settings/expense-categories",
]);

const uuid = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const allowedAssistantDynamicRoutes = [
  new RegExp(`^/(?:\\(tabs\\)/)?blocks/${uuid}(?:/edit)?$`, "i"),
  new RegExp(`^/activities/${uuid}$`, "i"),
  new RegExp(`^/contacts/${uuid}(?:/edit)?$`, "i"),
  new RegExp(`^/expenses/${uuid}$`, "i"),
  new RegExp(`^/products/${uuid}(?:/(?:edit|inventory))?$`, "i"),
  new RegExp(`^/purchases/${uuid}(?:/receive)?$`, "i"),
  new RegExp(`^/reminders/${uuid}$`, "i"),
  new RegExp(`^/sales/${uuid}(?:/(?:deliver|deliver-eggs))?$`, "i"),
  new RegExp(`^/sessions/${uuid}/activity$`, "i"),
  new RegExp(`^/transactions/${uuid}/(?:receipt|returns|settlements)$`, "i"),
  /^\/reports\/(?:sales|expenses|production|flock|inventory|accounts)$/,
];

export function assistantHref(path: string): Href | null {
  const [pathname] = path.split("?", 1);
  if (
    allowedAssistantRoutes.has(pathname) ||
    allowedAssistantDynamicRoutes.some((route) => route.test(pathname))
  ) {
    return path as Href;
  }
  return null;
}
