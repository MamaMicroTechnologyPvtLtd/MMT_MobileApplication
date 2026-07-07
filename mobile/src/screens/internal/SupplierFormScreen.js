import React, { useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { api } from '../../api/client';
import { Button, Field, Card } from '../../components/ui';
import { colors, spacing } from '../../theme';

const FIELDS = [
  ['supplier_firm_name', 'Firm / company name'], ['contact_person_name', 'Contact person'],
  ['mobile', 'Mobile number', 'phone-pad'], ['alt_number', 'Alternate number', 'phone-pad'],
  ['landline', 'Landline'], ['email', 'Email'],
  ['current_gst_info', 'GST number'],
  ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['country', 'Country'],
  ['pincode', 'Pincode', 'numeric'],
  ['pan_number', 'PAN'], ['aadhar_number', 'Aadhaar'],
  ['account_number', 'Account number'], ['ifsc', 'IFSC'], ['bank_name', 'Bank name'],
  ['supplier_type', 'Supplier type'],
];

// Add a new supplier (continues the S-series) or EDIT an existing one.
export default function SupplierFormScreen({ route, navigation }) {
  const existing = route.params?.supplier;
  const isEdit = !!existing;
  const [form, setForm] = useState(() => {
    const init = {};
    FIELDS.forEach(([k]) => { init[k] = existing?.[k] ? String(existing[k]) : ''; });
    return init;
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? `Edit ${existing.supplier_id}` : 'Add supplier' });
  }, [navigation, isEdit, existing]);

  const submit = async () => {
    const body = {};
    Object.entries(form).forEach(([k, v]) => { if (v !== '') body[k] = v; });
    if (!isEdit && !body.supplier_firm_name) {
      Alert.alert('Details needed', 'Enter at least the firm name.');
      return;
    }
    setSaving(true);
    try {
      const saved = isEdit
        ? await api(`/suppliers/${existing.supplier_id}`, { method: 'PUT', body })
        : await api('/suppliers', { method: 'POST', body });
      Alert.alert(isEdit ? 'Updated' : 'Supplier added', saved.supplier_id, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      {isEdit ? <Text style={styles.id}>{existing.supplier_id}</Text> : (
        <Text style={styles.note}>A new supplier ID will be assigned automatically, continuing the series.</Text>
      )}
      <Card>
        {FIELDS.map(([k, label, kb]) => (
          <Field key={k} label={label} value={form[k]} onChangeText={set(k)} keyboardType={kb} autoCapitalize={k === 'email' ? 'none' : k === 'ifsc' ? 'characters' : 'sentences'} />
        ))}
      </Card>
      <Button title={isEdit ? 'Save changes' : 'Add supplier'} onPress={submit} loading={saving} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  id: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: spacing.md },
  note: { fontSize: 13, color: colors.muted, marginBottom: spacing.md },
});
