import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Card, Badge, Button, EmptyState } from '../../components/ui';
import { colors, spacing } from '../../theme';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

const stageLabel = {
  requirement: 'New requirement',
  final_quotation: 'Final quotation requested',
  final_po: 'Final PO requested',
};

// Supplier home: requirements received from the MMT team, each with a Reply
// button. Final quotation / PO requests appear here too (highlighted).
export default function SupplierRequirementsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api('/supplier/requirements'));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }) => {
    const isFinal = item.stage === 'final_quotation' || item.stage === 'final_po';
    const responded = item.last_quote_id != null && item.last_stage === (item.stage === 'requirement' ? 'quotation' : item.stage);
    return (
      <Card style={isFinal ? styles.finalCard : null}>
        <View style={styles.top}>
          <Text style={styles.oid}>{item.order_id}</Text>
          <Badge label={isFinal ? item.stage : item.request_status} />
        </View>
        <Text style={[styles.stage, isFinal && { color: colors.accent }]}>{stageLabel[item.stage]}</Text>
        <Text style={styles.req}>{item.requirement || '—'}</Text>
        {item.note ? <Text style={styles.note}>Note: {item.note}</Text> : null}
        <Text style={styles.meta}>
          {[item.quantity, item.price_range && `Range ${item.price_range}`, item.pincode && `PIN ${item.pincode}`, fmt(item.sent_at)]
            .filter(Boolean).join('  •  ')}
        </Text>

        {item.last_quote_id ? (
          <Text style={styles.prev}>
            Last sent: {money(item.last_price)} · {[item.last_duration, item.last_duration_unit].filter(Boolean).join(' ')}
            {item.last_document_url ? ' · 📎 doc' : ''}
          </Text>
        ) : null}

        <Button
          title={isFinal ? `Send ${item.stage === 'final_po' ? 'Final PO' : 'Final Quotation'}`
            : (responded ? 'Update quotation' : 'Reply with quotation')}
          variant={isFinal ? 'primary' : (responded ? 'ghost' : 'primary')}
          style={{ marginTop: spacing.md }}
          onPress={() => navigation.navigate('SupplierReply', {
            orderId: item.order_id,
            stage: item.stage,
            requirement: item.requirement,
            note: item.note,
          })}
        />
      </Card>
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      data={items}
      keyExtractor={(x) => x.order_id}
      renderItem={renderItem}
      ListHeaderComponent={<Text style={styles.h1}>Requirements</Text>}
      ListEmptyComponent={<EmptyState icon="📭" title="No requirements yet" subtitle="Requirements sent by the MMT team will appear here." />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    />
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  finalCard: { borderColor: colors.accent, borderWidth: 1.5 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  oid: { fontSize: 13, fontWeight: '800', color: colors.primary },
  stage: { fontSize: 13, fontWeight: '800', color: colors.info, marginBottom: 4 },
  req: { fontSize: 15, fontWeight: '600', color: colors.text },
  note: { fontSize: 13, color: colors.muted, marginTop: 2, fontStyle: 'italic' },
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
  prev: { fontSize: 13, color: colors.success, fontWeight: '700', marginTop: 6 },
});
