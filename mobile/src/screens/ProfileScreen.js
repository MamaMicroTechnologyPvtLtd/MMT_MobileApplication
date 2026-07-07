import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/ui';
import { colors, spacing } from '../theme';

// Profile of the registered + logged-in customer (opened from the top-right avatar).
export default function ProfileScreen() {
  const { user, profile, logout } = useAuth();
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
    || user?.full_name || 'Customer';

  const rows = [
    ['Customer ID', user?.customer_id],
    ['Name', name],
    ['Email', user?.email || profile?.email],
    ['Mobile', profile?.mobile_num || user?.phone],
    ['GST', profile?.customer_gst],
    ['Address', profile?.address],
    ['City', profile?.city],
    ['State', profile?.state],
    ['Pincode', profile?.pincode],
    ['Customer type', profile?.customer_type],
  ];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.hero}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.role}>Registered customer</Text>
      </View>

      <Card>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value || '—'}</Text>
          </View>
        ))}
      </Card>

      <Text style={styles.note}>
        Region details (city / state / pincode) are kept up to date by the MMT team. Contact us to
        update your profile.
      </Text>

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
  name: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  role: { fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 14, color: colors.muted },
  value: { fontSize: 14, color: colors.text, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  note: { fontSize: 13, color: colors.muted, marginVertical: spacing.lg, lineHeight: 18 },
});
