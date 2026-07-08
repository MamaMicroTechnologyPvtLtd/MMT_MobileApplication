import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { api } from '../../api/client';
import { Button, Field, Card } from '../../components/ui';
import { colors, spacing } from '../../theme';

const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

// Edit a supplier quote by adding our details + GST + tax + margin, then send to
// the customer in one click (with a temporary/masked supplier id).
export default function QuoteCustomerScreen({ route, navigation }) {
  const { orderId, supplierQuoteId, basePrice, quantity, duration } = route.params || {};
  const [form, setForm] = useState({
    base_amount: basePrice != null ? String(basePrice) : '',
    gst_percent: '18',
    margin: '',
    temp_supplier_id: '',
    quantity: quantity || '',
    duration: duration || '',
    note: '',
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [sending, setSending] = useState(false);

  const { taxAmount, total } = useMemo(() => {
    const base = num(form.base_amount);
    const tax = (base * num(form.gst_percent)) / 100;
    return { taxAmount: tax, total: base + tax + num(form.margin) };
  }, [form.base_amount, form.gst_percent, form.margin]);

  const send = async () => {
    if (!form.base_amount) {
      Alert.alert('Base amount needed', 'Enter the base amount before sending.');
      return;
    }
    setSending(true);
    try {
      const quote = await api(`/orders/${orderId}/quote-customer`, {
        method: 'POST',
        body: {
          based_on_supplier_quote: supplierQuoteId,
          temp_supplier_id: form.temp_supplier_id || undefined,
          base_amount: num(form.base_amount),
          gst_percent: num(form.gst_percent),
          tax_amount: taxAmount,
          margin: num(form.margin),
          total_amount: total,
          quantity: form.quantity || undefined,
          duration: form.duration || undefined,
          note: form.note || undefined,
        },
      });
      Alert.alert('Quotation sent', `${quote.quotation_id} sent to the customer (${money(quote.total_amount)}).`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not send', e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={styles.order}>Order {orderId}</Text>
      <Text style={styles.h1}>Send quotation to customer</Text>

      <Card>
        <Field label="Base amount (from supplier) *" value={form.base_amount} onChangeText={set('base_amount')} placeholder="e.g. 68000" keyboardType="numeric" />
        <View style={styles.two}>
          <View style={styles.half}><Field label="GST %" value={form.gst_percent} onChangeText={set('gst_percent')} placeholder="18" keyboardType="numeric" /></View>
          <View style={styles.half}><Field label="Margin ₹" value={form.margin} onChangeText={set('margin')} placeholder="e.g. 5000" keyboardType="numeric" /></View>
        </View>
        <View style={styles.two}>
          <View style={styles.half}><Field label="Quantity" value={form.quantity} onChangeText={set('quantity')} placeholder="200 bags" /></View>
          <View style={styles.half}><Field label="Delivery duration (from confirmation)" value={form.duration} onChangeText={set('duration')} placeholder="e.g. 3 days" /></View>
        </View>
        <Field label="Temp supplier ID (shown to customer)" value={form.temp_supplier_id} onChangeText={set('temp_supplier_id')} placeholder="e.g. MMT-TS-01" />
        <Field label="Note" value={form.note} onChangeText={set('note')} placeholder="Terms for the customer" multiline />
      </Card>

      <Card>
        <Row label="Base amount" value={money(num(form.base_amount))} />
        <Row label={`GST (${num(form.gst_percent)}%)`} value={money(taxAmount)} />
        <Row label="Margin" value={money(num(form.margin))} />
        <View style={styles.divider} />
        <Row label="Total to customer" value={money(total)} strong />
      </Card>

      <Button title="Send quotation to customer" onPress={send} loading={sending} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

function Row({ label, value, strong }) {
  return (
    <View style={styles.sumRow}>
      <Text style={[styles.sumLabel, strong && { fontWeight: '800', color: colors.text }]}>{label}</Text>
      <Text style={[styles.sumValue, strong && { fontWeight: '900', color: colors.primary, fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  order: { fontSize: 13, fontWeight: '800', color: colors.primary },
  h1: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md, marginTop: 2 },
  two: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  sumLabel: { fontSize: 14, color: colors.muted },
  sumValue: { fontSize: 15, color: colors.text, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
});
