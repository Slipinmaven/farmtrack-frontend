import { Ionicons } from "@expo/vector-icons";
import { forwardRef } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  trailingAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    accessibilityLabel: string;
    onPress: () => void;
  };
};

export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField(
    { label, error, leadingIcon, trailingAction, style, ...props },
    ref,
  ) {
    const { theme } = useTheme();
    return (
      <View style={styles.container}>
        <AppText size="small" weight="semibold">
          {label}
        </AppText>
        {leadingIcon || trailingAction ? (
          <View
            style={[
              styles.inputWithIcon,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: error ? theme.danger : theme.border,
              },
              props.multiline && styles.multilineWithIcon,
            ]}
          >
            {leadingIcon ? (
              <Ionicons
                name={leadingIcon}
                size={18}
                color={theme.textSecondary}
                style={props.multiline ? styles.multilineIcon : undefined}
              />
            ) : null}
            <TextInput
              {...props}
              ref={ref}
              accessibilityLabel={label}
              placeholderTextColor={theme.textSecondary}
              selectionColor={theme.primary}
              style={[
                styles.input,
                styles.iconInput,
                {
                  color: theme.text,
                  fontFamily: theme.fontFamily,
                },
                style,
              ]}
            />
            {trailingAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={trailingAction.accessibilityLabel}
                hitSlop={10}
                onPress={trailingAction.onPress}
                style={styles.trailingAction}
              >
                <Ionicons
                  name={trailingAction.icon}
                  size={19}
                  color={theme.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>
        ) : (
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
        )}
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
  inputWithIcon: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 6,
    paddingLeft: 13,
    paddingRight: 4,
  },
  iconInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  trailingAction: {
    width: 40,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  multilineWithIcon: { alignItems: "flex-start", paddingTop: 12 },
  multilineIcon: { marginTop: 3 },
});
