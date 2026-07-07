import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { colors, spacing } from '../theme';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

// Customer payments: advance/final requests, with a Pay-now checkout flow.
export default function PaymentsScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState(null);

  const load = useCallback(async () => {
    try { setItems(await api('/payments')); } catch (e) { Alert.alert('Error', e.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pay = async (p) => {
    setPayingId(p.id);
    try {
      const order = await api(`/payments/${p.id}/create-order`, { method: 'POST' });
      if (order.mode === 'mock') {
        // Development / no-gateway mode: settle directly.
        await api(`/payments/${p.id}/verify`, { method: 'POST', body: { mock: true } });
        Alert.alert('Payment successful', `${money(p.amount)} paid.`);
        await load();
      } else {
        // Razorpay mode: a real checkout requires the react-native-razorpay SDK
        // (a custom dev build). The order is created; the SDK's success callback
        // then calls POST /payments/:id/verify with the signature.
        Alert.alert(
          'Complete payment',
          `Order created for ${money(p.amount)}. Open the Razorpay checkout to finish (requires the payments-enabled app build).`
        );
      }
    } catch (e) {
      Alert.alert('Payment failed', e.message);
    } finally {
      setPayingId(null);
    }
  };

  const renderItem = ({ item }) => (
    <Card>
      <View style={styles.top}>
        <Text style={styles.amount}>{money(item.amount)}</Text>
        <Badge label={item.status} />
      </View>
      <Text style={styles.meta}>
        {[item.type, item.order_id, fmt(item.created_at)].filter(Boolean).join('  •  ')}
      </Text>
      {(item.status === 'pending' || item.status === 'processing') ? (
        <Button title="Pay now" onPress={() => pay(item)} loading={payingId === item.id} style={{ marginTop: spacing.md }} />
      ) : item.status === 'paid' ? (
        <Text style={styles.paid}>✓ Paid{item.reference ? ` · ${item.reference}` : ''}</Text>
      ) : null}
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
  paid: { marginTop: spacing.md, color: colors.success, fontWeight: '700' },
});
