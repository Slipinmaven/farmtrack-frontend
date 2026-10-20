import { forwardRef } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

type TextFieldProps = TextInputProps & { label: string; error?: string };

export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField({ label, error, style, ...props }, ref) {
    const { theme } = useTheme();
    return (
      <View style={styles.container}>
        <AppText size="small" weight="semibold">
          {label}
        </AppText>
        <TextInput
          {...props}
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.primary}
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: error ? theme.danger : theme.border,
              color: theme.text,
              fontFamily: theme.fontFamily,
            },
            style,
          ]}
        />
        {error ? (
          <AppText size="small" style={{ color: theme.danger }}>
            {error}
          </AppText>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { gap: 7 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 16,
  },
});
