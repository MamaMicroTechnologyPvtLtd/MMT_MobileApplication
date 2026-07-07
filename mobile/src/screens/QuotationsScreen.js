import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { Button, Card, Badge, EmptyState } from '../components/ui';
import { colors, spacing } from '../theme';

const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

// "Receive the quotation for the enquiry from the internal member" + respond.
export default function QuotationsScreen() {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setItems(await api('/quotations'));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (q, decision) => {
    setBusyId(q.quotation_id);
    try {
      await api(`/quotations/${q.quotation_id}/respond`, { method: 'POST', body: { decision } });
      await load();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }) => (
    <Card>
      <View style={styles.top}>
        <Text style={styles.qid}>{item.quotation_id}</Text>
        <Badge label={item.status} />
      </View>
      {item.subject ? <Text style={styles.subject}>{item.subject}</Text> : null}
      {item.requirement ? <Text style={styles.req} numberOfLines={2}>{item.requirement}</Text> : null}

      <View style={styles.grid}>
        <Row label="Quantity" value={item.quantity || '—'} />
        <Row label="Duration" value={item.duration || '—'} />
        <Row label="Base amount" value={money(item.base_amount)} />
        <Row label="GST" value={item.gst_percent != null ? `${item.gst_percent}%` : '—'} />
        <Row label="Total" value={money(item.total_amount)} strong />
        <Row label="Ref" value={item.temp_supplier_id || '—'} />
      </View>
      {item.note ? <Text style={styles.note}>Note: {item.note}</Text> : null}

      {item.status === 'sent' ? (
        <View style={styles.actions}>
          <Button title="Confirm" onPress={() => respond(item, 'confirm')} loading={busyId === item.quotation_id} style={{ flex: 1 }} />
          <Button title="Reject" variant="danger" onPress={() => respond(item, 'reject')} disabled={busyId === item.quotation_id} style={{ flex: 1 }} />
        </View>
      ) : (
        <Text style={styles.done}>
          {item.status === 'confirmed' ? '✓ You confirmed this quotation' : 'You rejected this quotation'}
        </Text>
      )}
    </Card>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      data={items}
      keyExtractor={(x) => x.quotation_id}
      renderItem={renderItem}
      ListEmptyComponent={<EmptyState icon="📄" title="No quotations yet" subtitle="Quotations from the MMT team will appear here." />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    />
  );
}

function Row({ label, value, strong }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, strong && { color: colors.primary, fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  qid: { fontSize: 13, fontWeight: '800', color: colors.primary },
  subject: { fontSize: 16, fontWeight: '700', color: colors.text },
  req: { fontSize: 14, color: colors.muted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
  cell: { width: '50%', marginBottom: spacing.sm },
  cellLabel: { fontSize: 12, color: colors.muted },
  cellValue: { fontSize: 15, color: colors.text, fontWeight: '600' },
  note: { fontSize: 13, color: colors.muted, marginTop: 4, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  done: { marginTop: spacing.md, fontWeight: '700', color: colors.muted },
});
