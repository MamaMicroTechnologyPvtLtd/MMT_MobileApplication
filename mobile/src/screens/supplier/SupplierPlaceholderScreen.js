import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui';
import { colors, spacing } from '../../theme';

// The full Supplier interface (receive requirements, reply with quotation, final
// PO flow) is the next phase. This placeholder keeps supplier logins functional.
export default function SupplierPlaceholderScreen() {
  const { user, profile, logout } = useAuth();
  return (
    <View style={styles.wrap}>
      <Text style={{ fontSize: 40 }}>🏭</Text>
      <Text style={styles.title}>Supplier interface — coming next</Text>
      <Text style={styles.sub}>
        Signed in as {profile?.supplier_firm_name || user?.email}
        {user?.supplier_id ? ` (${user.supplier_id})` : ''}.
      </Text>
      <Text style={styles.body}>
        You&apos;ll receive requirements from the MMT team here and reply with your quotation
        (PDF + duration + note), then handle final PO requests.
      </Text>
      <Button title="Log out" variant="danger" onPress={logout} style={{ marginTop: spacing.xl, alignSelf: 'stretch' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  sub: { fontSize: 14, color: colors.primary, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  body: { fontSize: 14, color: colors.muted, marginTop: spacing.md, textAlign: 'center', lineHeight: 20 },
});
