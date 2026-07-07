import React, { useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { api } from '../../api/client';
import { Button, Field, Card } from '../../components/ui';
import { colors, spacing } from '../../theme';

const FIELDS = [
  ['first_name', 'First name'], ['last_name', 'Last name'],
  ['mobile_num', 'Mobile number', 'phone-pad'], ['alt_mobile', 'Alternate mobile', 'phone-pad'],
  ['email', 'Email'], ['customer_gst', 'GST number'],
  ['address', 'Address'], ['street', 'Street'],
  ['city', 'City'], ['state', 'State'], ['country', 'Country'], ['pincode', 'Pincode', 'numeric'],
  ['pan_no', 'PAN'], ['aadhar_number', 'Aadhaar'],
  ['customer_type', 'Customer type'],
];

// Add a new customer (continues the C-series) or EDIT an existing one to keep
// region/contact details up to date.
export default function CustomerFormScreen({ route, navigation }) {
  const existing = route.params?.customer;
  const isEdit = !!existing;
  const [form, setForm] = useState(() => {
    const init = {};
    FIELDS.forEach(([k]) => { init[k] = existing?.[k] ? String(existing[k]) : ''; });
    return init;
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? `Edit ${existing.customer_id}` : 'Add customer' });
  }, [navigation, isEdit, existing]);

  const submit = async () => {
    const body = {};
    Object.entries(form).forEach(([k, v]) => { if (v !== '') body[k] = v; });
    if (!isEdit && !body.first_name && !body.mobile_num) {
      Alert.alert('Details needed', 'Enter at least a name or mobile number.');
      return;
    }
    setSaving(true);
    try {
      const saved = isEdit
        ? await api(`/customers/${existing.customer_id}`, { method: 'PUT', body })
        : await api('/customers', { method: 'POST', body });
      Alert.alert(isEdit ? 'Updated' : 'Customer added', saved.customer_id, [
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
      {isEdit ? <Text style={styles.id}>{existing.customer_id}</Text> : (
        <Text style={styles.note}>A new customer ID will be assigned automatically, continuing the series.</Text>
      )}
      <Card>
        {FIELDS.map(([k, label, kb]) => (
          <Field key={k} label={label} value={form[k]} onChangeText={set(k)} keyboardType={kb} autoCapitalize={k === 'email' ? 'none' : 'sentences'} />
        ))}
      </Card>
      <Button title={isEdit ? 'Save changes' : 'Add customer'} onPress={submit} loading={saving} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  id: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: spacing.md },
  note: { fontSize: 13, color: colors.muted, marginBottom: spacing.md },
});
