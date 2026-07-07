import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/ui';
import { colors, spacing } from '../theme';

// Profile of the registered + logged-in user (opened from the top-right avatar).
// Role-aware: customers see their business profile; internal employees see their
// account; suppliers see their firm details.
export default function ProfileScreen() {
  const { user, profile, logout } = useAuth();

  const roleLabel = {
    customer: 'Registered customer',
    internal: 'Company employee (MAM Home)',
    supplier: 'Registered supplier',
  }[user?.role] || 'User';

  let name = user?.full_name || user?.email || 'User';
  let rows = [];

  if (user?.role === 'customer') {
    name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || name;
    rows = [
      ['Customer ID', user?.customer_id],
      ['Name', name],
      ['Email', user?.email || profile?.email],
      ['Mobile', profile?.mobile_num || user?.phone],
      ['GST', profile?.customer_gst],
      ['City', profile?.city],
      ['Pincode', profile?.pincode],
    ];
  } else if (user?.role === 'supplier') {
    name = profile?.supplier_firm_name || name;
    rows = [
      ['Supplier ID', user?.supplier_id],
      ['Firm', profile?.supplier_firm_name],
      ['Contact person', profile?.contact_person_name],
      ['Email', profile?.email || user?.email],
      ['Mobile', profile?.mobile || user?.phone],
      ['GST', profile?.current_gst_info],
      ['City', profile?.city],
      ['Pincode', profile?.pincode],
    ];
  } else {
    rows = [
      ['Name', user?.full_name],
      ['Email', user?.email],
      ['Phone', user?.phone],
      ['Role', 'Internal team'],
    ];
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.hero}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.role}>{roleLabel}</Text>
      </View>

      <Card>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value || '—'}</Text>
          </View>
        ))}
      </Card>

      <Button title="Log out" variant="danger" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primary,
  },
  avatarText: { fontSize: 32, fontWeight: '900', color: colors.primaryDark },
  name: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  role: { fontSize: 14, color: colors.muted, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 14, color: colors.muted },
  value: { fontSize: 14, color: colors.text, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
});
