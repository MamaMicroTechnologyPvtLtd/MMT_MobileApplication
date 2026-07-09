import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState } from '../../components/ui';
import { colors, spacing, fmtDateTime as fmt } from '../../theme';

export default function OrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setOrders(await api('/orders')); } catch { /* noop */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('OrderDetail', { orderId: item.order_id })}>
      <Card>
        <View style={styles.top}>
          <Text style={styles.oid}>{item.order_id}</Text>
          <Badge label={item.status} />
        </View>
        <Text style={styles.customer}>
          {[item.first_name, item.last_name].filter(Boolean).join(' ') || item.customer_id}
        </Text>
        <Text style={styles.req} numberOfLines={2}>{item.requirement || '—'}</Text>
        <View style={styles.stats}>
          <Text style={styles.stat}>👥 {item.suppliers_count || 0} sent</Text>
          <Text style={styles.stat}>📄 {item.quotes_count || 0} quotes</Text>
          <Text style={styles.stat}>{fmt(item.created_at)}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      data={orders}
      keyExtractor={(x) => x.order_id}
      renderItem={renderItem}
      ListEmptyComponent={<EmptyState icon="📦" title="No orders yet" subtitle="Create an order from an enquiry to begin." />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    />
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  oid: { fontSize: 13, fontWeight: '800', color: colors.primary },
  customer: { fontSize: 15, fontWeight: '700', color: colors.text },
  req: { fontSize: 14, color: colors.muted, marginTop: 2 },
  stats: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  stat: { fontSize: 12, color: colors.muted, fontWeight: '600' },
});
