import React, { useState, useCallback } from 'react';
import {
  Text, StyleSheet, FlatList, RefreshControl, Alert, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { Card, Badge, EmptyState } from '../components/ui';
import { colors, spacing } from '../theme';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

// Customer payments — view only. Payments are made to the company bank account
// outside the app; the MMT team updates the status here.
export default function PaymentsScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api('/payments')); } catch (e) { Alert.alert('Error', e.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }) => (
    <Card>
      <View style={styles.top}>
        <Text style={styles.amount}>{money(item.amount)}</Text>
        <Badge label={item.status} />
      </View>
      <Text style={styles.meta}>
        {[item.type, item.order_id, fmt(item.created_at)].filter(Boolean).join('  •  ')}
      </Text>
      {item.status === 'paid' ? (
        <Text style={styles.paid}>
          ✓ Received{item.method ? ` via ${item.method}` : ''}{item.reference ? ` · ${item.reference}` : ''}
        </Text>
      ) : (
        <Text style={styles.pending}>
          Please pay to the company bank account. The MMT team will update the status here once received.
        </Text>
      )}
      {item.remark ? <Text style={styles.remark}>{item.remark}</Text> : null}
    </Card>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      data={items}
      keyExtractor={(x) => String(x.id)}
      renderItem={renderItem}
      ListHeaderComponent={<Text style={styles.h1}>Payments</Text>}
      ListEmptyComponent={<EmptyState icon="💳" title="No payments yet" subtitle="Advance and final payment requests will appear here." />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    />
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 20, fontWeight: '900', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  paid: { marginTop: spacing.sm, color: colors.success, fontWeight: '700' },
  pending: { marginTop: spacing.sm, color: colors.muted, fontSize: 13, lineHeight: 18 },
  remark: { marginTop: 4, color: colors.muted, fontSize: 13, fontStyle: 'italic' },
});
