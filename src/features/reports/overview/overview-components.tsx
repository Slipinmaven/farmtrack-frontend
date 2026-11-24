import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import type { ProfitabilityProduct } from "@/features/management/api";
import { formatCurrencyAmount, formatQuantityWithUnit } from "@/features/reports/overview/overview-utils";
import { useTheme } from "@/providers/theme-provider";
import { styles } from "@/features/reports/overview/styles";

export function ProductProfitSection({
  products,
  currency,
}: {
  products: ProfitabilityProduct[];
  currency: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.productSection}>
      <View style={styles.reportSectionHeading}>
        <View style={styles.grow}>
          <AppText size="heading" weight="semibold">Product profit</AppText>
          <AppText size="small" tone="secondary">
            Net sales less stock cost, before farm expenses
          </AppText>
        </View>
        <Ionicons name="stats-chart-outline" size={19} color={theme.primary} />
      </View>
      {products.length ? (
        <Card style={styles.productSectionCard}>
          {products.map((item, index) => {
            const grossProfit =
              item.gross_profit === null || Number(item.uncosted_quantity) > 0
                ? null
                : Number(item.gross_profit);
            const marginColor =
              grossProfit === null
                ? theme.secondary
                : grossProfit < 0
                  ? theme.danger
                  : theme.success;
            const statusLabel =
              grossProfit === null
                ? "Cost missing"
                : grossProfit < 0
                  ? "Selling at a loss"
                  : grossProfit === 0
                    ? "Break-even"
                    : "Profitable";
            return (
              <View
                key={item.product_id}
                style={[
                  styles.productProfitRow,
                  index > 0 && { borderTopColor: theme.border },
                ]}
              >
                <View style={styles.productProfitTitle}>
                  <View style={styles.grow}>
                    <AppText size="body" weight="semibold">
                      {item.product_name}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {formatQuantityWithUnit(
                        item.quantity_sold,
                        item.unit_abbreviation,
                        item.unit_name,
                      )} sold
                    </AppText>
                  </View>
                  <View style={[styles.marginBadge, { backgroundColor: `${marginColor}18` }]}>
                    <AppText size="small" weight="semibold" style={{ color: marginColor }}>
                      {statusLabel}
                    </AppText>
                  </View>
                </View>
                <View style={styles.productMetricPair}>
                  <ProductMetric
                    label="Net sales"
                    value={formatCurrencyAmount(Number(item.net_sales), currency)}
                  />
                  <ProductMetric
                    label="Recorded stock cost"
                    value={
                      Number(item.uncosted_quantity) > 0
                        ? "Not verified"
                        : formatCurrencyAmount(Number(item.cost_of_goods_sold), currency)
                    }
                  />
                </View>
                <View style={[styles.grossProfitMetric, { borderTopColor: theme.border }]}>
                  <AppText size="small" tone="secondary">
                    Gross profit
                  </AppText>
                  <AppText
                    size="body"
                    weight="semibold"
                    style={{ color: marginColor }}
                  >
                    {grossProfit === null
                      ? "Not verified"
                      : formatCurrencyAmount(grossProfit, currency)}
                  </AppText>
                </View>
                {item.estimated_cost_used || Number(item.uncosted_quantity) > 0 ? (
                  <View style={styles.productFootnotes}>
                    {item.estimated_cost_used ? (
                      <AppText size="small" tone="secondary">
                        Estimated cost used
                      </AppText>
                    ) : null}
                    {Number(item.uncosted_quantity) > 0 ? (
                      <AppText size="small" tone="secondary">
                        {formatQuantityWithUnit(
                          item.uncosted_quantity,
                          item.unit_abbreviation,
                          item.unit_name,
                        )} sold without recorded cost
                      </AppText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : (
        <Card style={styles.productSectionCard}>
          <AppText size="small" tone="secondary">
            No product sales were recorded in this period.
          </AppText>
        </Card>
      )}
    </View>
  );
}

function ProductMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.productMetric, { backgroundColor: theme.backgroundSelected }]}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
      >
        {value}
      </AppText>
    </View>
  );
}

export function ProfitabilityValueRow({
  label,
  value,
  deduct = false,
  strong = false,
  highlight,
  showBorder = false,
  borderColor,
  formatAmount,
}: {
  label: string;
  value: string;
  deduct?: boolean;
  strong?: boolean;
  highlight?: string;
  showBorder?: boolean;
  borderColor?: string;
  formatAmount: (value: string | number) => string;
}) {
  const { theme } = useTheme();
  const amount = Number(value);
  return (
    <View
      style={[
        styles.profitabilityRow,
        showBorder && {
          borderTopColor: borderColor ?? theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <AppText
        size="small"
        weight={strong ? "semibold" : "regular"}
        style={[styles.grow, highlight ? { color: highlight } : undefined]}
      >
        {label}
      </AppText>
      <AppText
        size="small"
        weight={strong ? "semibold" : "regular"}
        style={highlight ? { color: highlight } : undefined}
      >
        {deduct && amount > 0 ? "− " : ""}{formatAmount(value)}
      </AppText>
    </View>
  );
}

export function PeriodOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.periodOption,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  currency,
  detail,
  accent,
  valueColor,
  statusLabel,
  statusColor,
  statusIcon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  currency: string;
  detail: string;
  accent: string;
  valueColor: string;
  statusLabel?: string;
  statusColor?: string;
  statusIcon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        label,
        `${currency} ${new Intl.NumberFormat(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value)}`,
        detail,
        statusLabel,
      ].filter(Boolean).join(". ")}
      onPress={onPress}
      style={[
        styles.metricCard,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={styles.metricHeader}>
        <View style={[styles.metricIcon, { backgroundColor: `${accent}1A` }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        {statusLabel && statusColor && statusIcon ? (
          <View style={[styles.metricStatus, { backgroundColor: `${statusColor}18` }]}>
            <Ionicons name={statusIcon} size={15} color={statusColor} />
          </View>
        ) : null}
      </View>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <MoneyValue value={value} currency={currency} color={valueColor} />
      <View style={styles.metricFooter}>
        <AppText size="small" tone="secondary" style={styles.metricDetail}>
          {detail}
        </AppText>
        <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

function MoneyValue({
  value,
  currency,
  color,
}: {
  value: number;
  currency: string;
  color?: string;
}) {
  return (
    <View style={styles.moneyValue}>
      <AppText size="small" weight="semibold" style={color ? { color } : undefined}>
        {formatCurrencyAmount(value, currency)}
      </AppText>
    </View>
  );
}
export function SnapshotRow({
  icon,
  title,
  value,
  detail,
  href,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  detail: string;
  href: Href;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={styles.snapshotRow}
    >
      <View style={[styles.snapshotIcon, { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.grow}>
        <AppText size="small" weight="semibold">
          {title}
        </AppText>
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      </View>
      <AppText size="heading" weight="semibold">
        {value}
      </AppText>
    </Pressable>
  );
}

export function ShortcutChip({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} report`}
      onPress={onPress}
      style={[
        styles.shortcutChip,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <Ionicons name={icon} size={17} color={theme.primary} />
      <AppText size="small" weight="semibold">{title}</AppText>
    </Pressable>
  );
}
