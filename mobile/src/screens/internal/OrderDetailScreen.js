import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, API_BASE_URL, getToken } from '../../api/client';
import { Card, Badge, Button, EmptyState } from '../../components/ui';
import { colors, spacing, radius, statusColor } from '../../theme';

const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

// Order detail = the Comparison Sheet + the finalize / quote / delivery actions.
export default function OrderDetailScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [o, cmp] = await Promise.all([
        api(`/orders/${orderId}`),
        api(`/orders/${orderId}/comparison`).catch(() => ({ rows: [] })),
      ]);
      setOrder(o);
      setRows(cmp.rows || []);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (row, body, msg) => {
    setBusyId(row.id);
    try {
      await api(`/supplier-quotations/${row.id}`, { method: 'PATCH', body });
      if (msg) Alert.alert('Done', msg);
      await load();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = async () => {
    try {
      const token = await getToken();
      const url = `${API_BASE_URL}/orders/${orderId}/comparison.csv?token=${encodeURIComponent(token)}`;
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert('Export', 'Could not open the export link on this device.');
    } catch (e) {
      Alert.alert('Export failed', e.message);
    }
  };

  if (!order) {
    return <View style={styles.center}><Text style={{ color: colors.muted }}>Loading…</Text></View>;
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Card>
        <View style={styles.top}>
          <Text style={styles.oid}>{order.order_id}</Text>
          <Badge label={order.status} />
        </View>
        <Text style={styles.customer}>
          {[order.first_name, order.last_name].filter(Boolean).join(' ') || order.customer_id}
          {order.mobile_num ? `  ·  ${order.mobile_num}` : ''}
        </Text>
        {order.requirement ? <Text style={styles.req}>{order.requirement}</Text> : null}
        {order.note ? <Text style={styles.note}>Note: {order.note}</Text> : null}
        <Text style={styles.meta}>
          {[order.quantity, order.price_range, order.pincode && `PIN ${order.pincode}`].filter(Boolean).join('  •  ')}
        </Text>
        <View style={styles.rowBtns}>
          <Button title="Send / add suppliers" variant="ghost" style={{ flex: 1 }}
            onPress={() => navigation.navigate('SendRequirement', { orderId, pincode: order.pincode, requirement: order.requirement })} />
        </View>
      </Card>

      <View style={styles.sheetHeader}>
        <View>
          <Text style={styles.h2}>Comparison Sheet</Text>
          <Text style={styles.sub}>{rows.length} supplier response(s)</Text>
        </View>
        {rows.length > 0 ? (
          <TouchableOpacity style={styles.exportBtn} onPress={exportCsv}>
            <Text style={styles.exportText}>⬇ Export CSV</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {rows.length === 0 ? (
        <EmptyState icon="📊" title="No quotations yet" subtitle="Supplier responses will appear here as a comparison sheet." />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.sheetWrap}>
          <View>
            <View style={[styles.tr, styles.trHead]}>
              {['Person', 'Company', 'Location', 'GST', 'Phone', 'Mail', 'Price', 'Qty', 'Duration', 'Note', 'Status'].map((h) => (
                <Text key={h} style={[styles.th, colWidth(h)]}>{h}</Text>
              ))}
            </View>
            {rows.map((r) => (
              <View key={r.id} style={styles.tr}>
                <Text style={[styles.td, colWidth('Person')]}>{r.contact_person_name || '—'}</Text>
                <Text style={[styles.td, colWidth('Company')]}>{r.supplier_firm_name || '—'}</Text>
                <Text style={[styles.td, colWidth('Location')]}>{r.location || '—'}</Text>
                <Text style={[styles.td, colWidth('GST')]}>{r.gst || '—'}</Text>
                <Text style={[styles.td, colWidth('Phone')]}>{r.phone || '—'}</Text>
                <Text style={[styles.td, colWidth('Mail')]}>{r.mail || '—'}</Text>
                <Text style={[styles.td, colWidth('Price'), styles.price]}>{money(r.price)}</Text>
                <Text style={[styles.td, colWidth('Qty')]}>{r.quantity || '—'}</Text>
                <Text style={[styles.td, colWidth('Duration')]}>{[r.duration, r.duration_unit].filter(Boolean).join(' ') || '—'}</Text>
                <Text style={[styles.td, colWidth('Note')]}>{r.note || '—'}</Text>
                <View style={[colWidth('Status')]}><Badge label={r.status} /></View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {rows.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.h3}>Finalize per supplier</Text>
          {rows.map((r) => (
            <Card key={`act-${r.id}`}>
              <View style={styles.actTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actName}>{r.supplier_firm_name || r.supplier_id}</Text>
                  <Text style={styles.actPrice}>{money(r.price)} · {[r.duration, r.duration_unit].filter(Boolean).join(' ')}</Text>
                </View>
                <Badge label={r.status} />
              </View>
              <View style={styles.actBtns}>
                <MiniBtn label="Shortlist" onPress={() => act(r, { status: 'shortlisted' }, 'Shortlisted')} busy={busyId === r.id} />
                <MiniBtn label="Ask Final Quote" onPress={() => act(r, { status: 'shortlisted', request_stage: 'final_quotation' }, 'Requested final quotation')} busy={busyId === r.id} />
                <MiniBtn label="Ask Final PO" onPress={() => act(r, { status: 'shortlisted', request_stage: 'final_po' }, 'Requested final PO')} busy={busyId === r.id} />
              </View>
              <Button
                title="Use this quote → send to customer"
                style={{ marginTop: spacing.sm }}
                onPress={() => navigation.navigate('QuoteCustomer', {
                  orderId,
                  supplierQuoteId: r.id,
                  basePrice: r.price,
                  quantity: r.quantity,
                  duration: [r.duration, r.duration_unit].filter(Boolean).join(' '),
                })}
              />
            </Card>
          ))}
        </View>
      ) : null}

      <View style={{ height: spacing.md }} />
      <Button title="Create delivery for this order" variant="ghost"
        onPress={() => navigation.navigate('CreateDelivery', { orderId, customerId: order.customer_id, projectId: order.project_id })} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

function MiniBtn({ label, onPress, busy }) {
  return (
    <TouchableOpacity style={styles.mini} onPress={onPress} disabled={busy}>
      <Text style={styles.miniText}>{label}</Text>
    </TouchableOpacity>
  );
}

// Wider columns for free-text fields.
function colWidth(h) {
  const wide = { Company: 150, Location: 120, GST: 150, Mail: 160, Note: 160, Person: 110 };
  return { width: wide[h] || 90 };
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  oid: { fontSize: 14, fontWeight: '800', color: colors.primary },
  customer: { fontSize: 16, fontWeight: '700', color: colors.text },
  req: { fontSize: 14, color: colors.text, marginTop: 4 },
  note: { fontSize: 13, color: colors.muted, marginTop: 2, fontStyle: 'italic' },
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
  rowBtns: { flexDirection: 'row', marginTop: spacing.md },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
  h3: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  sub: { fontSize: 13, color: colors.muted, marginBottom: spacing.sm },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  exportBtn: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 7, marginBottom: spacing.sm,
  },
  exportText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  sheetWrap: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.sm,
  },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  trHead: { borderBottomWidth: 2 },
  th: { fontSize: 12, fontWeight: '800', color: colors.muted, paddingHorizontal: 6 },
  td: { fontSize: 13, color: colors.text, paddingHorizontal: 6 },
  price: { fontWeight: '800', color: colors.primary },
  actTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  actName: { fontSize: 15, fontWeight: '700', color: colors.text },
  actPrice: { fontSize: 13, color: colors.muted, marginTop: 2 },
  actBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mini: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  miniText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
});
