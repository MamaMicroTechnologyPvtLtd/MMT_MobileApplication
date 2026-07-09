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
  const [materials, setMaterials] = useState([{ material: '', quantity: '', unit: '' }]);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const setMat = (idx, key) => (v) =>
    setMaterials((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  const addMaterial = () => setMaterials((rows) => [...rows, { material: '', quantity: '', unit: '' }]);
  const removeMaterial = (idx) => setMaterials((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const submit = async () => {
    if (!form.project_name && !form.customer_name && !form.phone) {
      Alert.alert('Details needed', 'Enter at least a project name, customer, or phone.');
      return;
    }
    const cleanMaterials = materials.filter((m) => m.material.trim() || m.quantity.trim() || m.unit.trim());
    setSaving(true);
    try {
      await api('/listings', { method: 'POST', body: { ...form, status, materials: cleanMaterials } });
      Alert.alert('Listing saved', 'Added to today’s listings.');
      setForm(empty);
      setStatus('follow_up');
      setMaterials([{ material: '', quantity: '', unit: '' }]);
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
        <Field label="Requirement / note" value={form.requirement} onChangeText={set('requirement')} placeholder="Overall requirement (optional)" multiline />

        <Text style={styles.label}>Materials required</Text>
        <Text style={styles.hint}>Add each material with its quantity and unit — e.g. Cement · 50 · Bags, Bricks · 200 · No.</Text>
        {materials.map((m, idx) => (
          <View key={idx} style={styles.matRow}>
            <View style={{ flex: 2 }}>
              <Field label={null} value={m.material} onChangeText={setMat(idx, 'material')} placeholder="Material (e.g. Cement)" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={null} value={m.quantity} onChangeText={setMat(idx, 'quantity')} placeholder="Qty" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={null} value={m.unit} onChangeText={setMat(idx, 'unit')} placeholder="Unit" />
            </View>
            <TouchableOpacity onPress={() => removeMaterial(idx)} style={styles.matDel} disabled={materials.length === 1}>
              <Text style={[styles.matDelText, materials.length === 1 && { opacity: 0.3 }]}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={addMaterial} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add another material</Text>
        </TouchableOpacity>

        <View style={styles.two}>
          <View style={styles.half}><Field label="Total quantity (optional)" value={form.quantity} onChangeText={set('quantity')} placeholder="Summary" /></View>
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
  hint: { fontSize: 12, color: colors.muted, marginBottom: spacing.sm, lineHeight: 16 },
  matRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  matDel: { paddingTop: 12, paddingHorizontal: 4 },
  matDelText: { color: colors.danger, fontWeight: '900', fontSize: 16 },
  addBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: spacing.md },
  addBtnText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  seg: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  segTextOn: { color: '#fff' },
});
