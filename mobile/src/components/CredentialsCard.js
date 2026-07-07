import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

// Displays an issued login (username = business ID) and its password.
// Text is selectable so the employee can long-press to copy and share it.
export default function CredentialsCard({ username, password, note }) {
  return (
    <View style={styles.card}>
      <Row label="Login ID" value={username} />
      <View style={styles.divider} />
      <Row label="Password" value={password} mono />
      <Text style={styles.note}>{note || 'Password is shown only once — note it down now.'}</Text>
    </View>
  );
}

function Row({ label, value, mono }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={[styles.value, mono && styles.mono]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  label: { fontSize: 13, color: colors.primaryDark, fontWeight: '700' },
  value: { fontSize: 16, color: colors.text, fontWeight: '800', maxWidth: '65%', textAlign: 'right' },
  mono: { fontFamily: 'monospace', letterSpacing: 1 },
  divider: { height: 1, backgroundColor: colors.primary, opacity: 0.3, marginVertical: 4 },
  note: { fontSize: 12, color: colors.primaryDark, marginTop: spacing.sm },
});
