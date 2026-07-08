import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity,
} from 'react-native';
import { api } from '../../api/client';
import { Button, Field, Card } from '../../components/ui';
import { colors, spacing, radius } from '../../theme';

const STATUSES = [
  ['positive', 'Positive'],
  ['follow_up', 'Follow-up'],
  ['negative', 'Negative'],
];

// Listing Engineer: record a project listing. Saved to today's day sheet.
export default function ListingFormScreen() {
  const empty = {
    project_name: '', customer_name: '', phone: '', location: '', pincode: '',
    category: '', requirement: '', quantity: '', budget: '', remark: '',
  };
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState('follow_up');
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.project_name && !form.customer_name && !form.phone) {
      Alert.alert('Details needed', 'Enter at least a project name, customer, or phone.');
      return;
    }
    setSaving(true);
    try {
      await api('/listings', { method: 'POST', body: { ...form, status } });
      Alert.alert('Listing saved', 'Added to today’s listings.');
      setForm(empty);
      setStatus('follow_up');
    } catch (e) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>New listing</Text>
      <Text style={styles.sub}>Record a project. It is saved to today&apos;s sheet.</Text>

      <Card>
        <Field label="Project name" value={form.project_name} onChangeText={set('project_name')} placeholder="e.g. G+1 at Yelahanka" />
        <Field label="Customer name" value={form.customer_name} onChangeText={set('customer_name')} placeholder="Contact person" />
        <View style={styles.two}>
          <View style={styles.half}><Field label="Phone" value={form.phone} onChangeText={set('phone')} placeholder="Mobile" keyboardType="phone-pad" /></View>
          <View style={styles.half}><Field label="Pincode" value={form.pincode} onChangeText={set('pincode')} placeholder="Pincode" keyboardType="numeric" /></View>
        </View>
        <Field label="Location / area" value={form.location} onChangeText={set('location')} placeholder="Area / site" />
        <Field label="Category" value={form.category} onChangeText={set('category')} placeholder="e.g. Cement, Steel" />
        <Field label="Requirement" value={form.requirement} onChangeText={set('requirement')} placeholder="What they need" multiline />
        <View style={styles.two}>
          <View style={styles.half}><Field label="Quantity" value={form.quantity} onChangeText={set('quantity')} placeholder="e.g. 50 bags" /></View>
          <View style={styles.half}><Field label="Budget" value={form.budget} onChangeText={set('budget')} placeholder="₹ range" /></View>
        </View>

        <Text style={styles.label}>Status</Text>
        <View style={styles.seg}>
          {STATUSES.map(([k, lbl]) => (
            <TouchableOpacity key={k} onPress={() => setStatus(k)} style={[styles.segItem, status === k && styles.segItemOn]}>
              <Text style={[styles.segText, status === k && styles.segTextOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Remark" value={form.remark} onChangeText={set('remark')} placeholder="Any note" multiline />
        <Button title="Save listing" onPress={submit} loading={saving} />
      </Card>
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: spacing.lg },
  two: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  seg: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  segTextOn: { color: '#fff' },
});
