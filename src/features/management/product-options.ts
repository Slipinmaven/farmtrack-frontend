import type { ProductType } from "@/features/management/api";

export const productTypeOptions: { value: ProductType; label: string }[] = [
  { value: "eggs", label: "Eggs" },
  { value: "chickens", label: "Chickens" },
  { value: "feed", label: "Feed" },
  { value: "medication", label: "Medication" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];

export function getProductTypeLabel(value: ProductType): string {
  return (
    productTypeOptions.find((option) => option.value === value)?.label ?? value
  );
}
