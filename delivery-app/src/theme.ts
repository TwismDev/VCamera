/**
 * A deliberately high-contrast, large-tap-target palette: drivers use this in
 * daylight, one-handed, often in a hurry.
 */
export const colors = {
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  primary: '#1D4ED8',
  primaryText: '#FFFFFF',
  success: '#15803D',
  successBg: '#DCFCE7',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  info: '#0E7490',
  infoBg: '#CFFAFE',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const type = {
  title: { fontSize: 26, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 19, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
  mono: { fontSize: 15, color: colors.text },
};
