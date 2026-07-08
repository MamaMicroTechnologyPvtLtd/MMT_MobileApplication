import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Button, Field, Card, Badge } from '../../components/ui';
import { colors, spacing, radius } from '../../theme';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const TYPES = ['advance', 'final', 'refund'];
const MODES = ['Bank transfer', 'UPI', 'Cheque', 'Cash'];
const STATUSES = ['pending', 'paid', 'failed'];

// Internal payment management for an order: raise a request, and record the
// mode/details/status once the customer pays to the company account (manual).
export default function ManagePaymentsScreen({ route }) {
  const { orderId, customerId } = route.params;
  const [payments, setPayments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // New request form
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('advance');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api('/payments');
      setPayments(all.filter((p) => p.order_id === orderId));
    } catch (e) { Alert.alert('Error', e.message); }
  }, [orderId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createRequest = async () => {
    if (!amount) { Alert.alert('Amount needed', 'Enter the amount to request.'); return; }
    setCreating(true);
    try {
      await api('/payments', { method: 'POST', body: { order_id: orderId, customer_id: customerId, amount: Number(amount), type } });
      setAmount('');
      await load();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setCreating(false); }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={styles.order}>Order {orderId}</Text>
      <Text style={styles.h1}>Payments</Text>

      <Card>
        <Text style={styles.section}>Request a payment</Text>
        <Field label="Amount (₹)" value={amount} onChangeText={setAmount} placeholder="e.g. 42620" keyboardType="numeric" />
        <Text style={styles.label}>Type</Text>
        <Segmented options={TYPES} value={type} onChange={setType} />
        <Button title="Request payment" onPress={createRequest} loading={creating} style={{ marginTop: spacing.md }} />
      </Card>

      <Text style={styles.section}>Payments for this order</Text>
      {payments.length === 0 ? (
        <Text style={styles.muted}>No payments yet.</Text>
      ) : payments.map((p) => (
        <PaymentRow key={p.id} payment={p} onSaved={load} />
      ))}
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

function PaymentRow({ payment, onSaved }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState(payment.method || 'Bank transfer');
  const [reference, setReference] = useState(payment.reference || '');
  const [remark, setRemark] = useState(payment.remark || '');
  const [status, setStatus] = useState(payment.status);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/payments/${payment.id}`, { method: 'PATCH', body: { status, method, reference, remark } });
      setOpen(false);
      await onSaved();
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <TouchableOpacity style={styles.rowTop} onPress={() => setOpen((o) => !o)}>
        <View>
          <Text style={styles.amount}>{money(payment.amount)} · {payment.type}</Text>
          <Text style={styles.muted}>
            {payment.method || 'mode not set'}{payment.reference ? ` · ${payment.reference}` : ''}
          </Text>
        </View>
        <Badge label={payment.status} />
      </TouchableOpacity>

      {open ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.label}>Mode</Text>
          <Segmented options={MODES} value={method} onChange={setMethod} small />
          <Field label="Reference / txn no." value={reference} onChangeText={setReference} placeholder="UTR / cheque no." />
          <Field label="Details / remark" value={remark} onChangeText={setRemark} placeholder="Any note" />
          <Text style={styles.label}>Status</Text>
          <Segmented options={STATUSES} value={status} onChange={setStatus} />
          <Button title="Save" onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
        </View>
      ) : (
        <Text style={styles.tapHint}>Tap to update mode / details / status</Text>
      )}
    </Card>
  );
}

function Segmented({ options, value, onChange, small }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <TouchableOpacity
          key={o}
          onPress={() => onChange(o)}
          style={[styles.segItem, small && styles.segItemSmall, value === o && styles.segItemOn]}
        >
          <Text style={[styles.segText, value === o && styles.segTextOn]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  order: { fontSize: 13, fontWeight: '800', color: colors.primary },
  h1: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2, marginBottom: spacing.md },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 4 },
  muted: { color: colors.muted, fontSize: 13 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 16, fontWeight: '800', color: colors.text },
  tapHint: { color: colors.muted, fontSize: 12, marginTop: 6 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segItem: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  segItemSmall: { paddingHorizontal: 11, paddingVertical: 7 },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' },
  segTextOn: { color: '#fff' },
});
