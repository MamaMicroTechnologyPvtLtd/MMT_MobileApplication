// Shared visual language for the app.
export const colors = {
  primary: '#0F766E', // teal 700
  primaryDark: '#115E59',
  primaryLight: '#CCFBF1',
  accent: '#F59E0B',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
  info: '#2563EB',
};

// Status → colour, used across enquiries/orders/deliveries/payments.
export const statusColor = (status) => {
  const map = {
    new: colors.info,
    in_discussion: colors.warning,
    quoted: colors.primary,
    sent: colors.info,
    confirmed: colors.success,
    rejected: colors.danger,
    pending: colors.warning,
    paid: colors.success,
    delivered: colors.success,
    in_transit: colors.info,
    dispatched: colors.info,
    cancelled: colors.danger,
    closed: colors.muted,
  };
  return map[status] || colors.muted;
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
