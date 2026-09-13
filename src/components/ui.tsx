import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

export function Screen({
  children,
  scroll = true,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Row({ label, value, emphasis }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[styles.rowValue, emphasis && styles.rowValueEmphasis]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        buttonVariants[variant],
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.primaryText} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonTextSecondary]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...inputProps}
        style={[styles.input, inputProps.multiline && styles.inputMultiline, inputProps.style]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({ text, tone }: { text: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }) {
  return (
    <View style={[styles.pill, pillTones[tone].container]}>
      <Text style={[styles.pillText, pillTones[tone].text]}>{text}</Text>
    </View>
  );
}

export function Banner({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: React.ReactNode }) {
  return (
    <View style={[styles.banner, pillTones[tone].container]}>
      <Text style={[styles.bannerText, pillTones[tone].text]}>{children}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

const buttonVariants: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  success: { backgroundColor: colors.success },
  danger: { backgroundColor: colors.danger },
};

const pillTones = {
  neutral: {
    container: { backgroundColor: colors.border },
    text: { color: colors.text },
  },
  info: { container: { backgroundColor: colors.infoBg }, text: { color: colors.info } },
  warning: { container: { backgroundColor: colors.warningBg }, text: { color: colors.warning } },
  success: { container: { backgroundColor: colors.successBg }, text: { color: colors.success } },
  danger: { container: { backgroundColor: colors.dangerBg }, text: { color: colors.danger } },
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },

  sectionTitle: { ...type.label, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.sm },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  rowLabel: { ...type.body, color: colors.textMuted, flexShrink: 1 },
  rowValue: { ...type.body, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  rowValueEmphasis: { fontSize: 20, fontWeight: '800' },

  button: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.primaryText, fontSize: 17, fontWeight: '700' },
  buttonTextSecondary: { color: colors.primary },

  field: { gap: spacing.xs },
  fieldLabel: { ...type.label },
  fieldHint: { fontSize: 12, color: colors.textMuted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    fontSize: 17,
    color: colors.text,
  },
  inputMultiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },

  pill: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 13, fontWeight: '700' },

  banner: { padding: spacing.md, borderRadius: radius.md },
  bannerText: { fontSize: 14, fontWeight: '600' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  loadingText: { ...type.body, color: colors.textMuted },

  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { ...type.heading, textAlign: 'center' },
  emptyBody: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
