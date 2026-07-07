import React, { useState, useLayoutEffect, useEffect, useCallback } from 'react';
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

  // Supplier login onboarding (edit mode only).
  const [account, setAccount] = useState(null);
  const [login, setLogin] = useState({ email: existing?.email || '', password: '' });
  const [creatingLogin, setCreatingLogin] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!isEdit) return;
    try {
      const res = await api(`/suppliers/${existing.supplier_id}/account`);
      setAccount(res);
    } catch { /* ignore */ }
  }, [isEdit, existing]);

  useEffect(() => { loadAccount(); }, [loadAccount]);

  const createLogin = async () => {
    if (!login.email || !login.password) {
      Alert.alert('Details needed', 'Enter an email and password for the supplier login.');
      return;
    }
    setCreatingLogin(true);
    try {
      await api(`/suppliers/${existing.supplier_id}/account`, {
        method: 'POST',
        body: { email: login.email.trim(), password: login.password },
      });
      Alert.alert('Login created', `${existing.supplier_id} can now log in with ${login.email.trim()}.`);
      setLogin((l) => ({ ...l, password: '' }));
      loadAccount();
    } catch (e) {
      Alert.alert('Could not create login', e.message);
    } finally {
      setCreatingLogin(false);
    }
  };

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

      {isEdit ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={styles.h2}>Supplier login</Text>
          {account?.has_login ? (
            <Card>
              <Text style={styles.loginOk}>✓ Login active</Text>
              <Text style={styles.loginEmail}>{account.account?.email}</Text>
              <Text style={styles.note}>This supplier can sign in to the Supplier interface.</Text>
            </Card>
          ) : (
            <Card>
              <Text style={styles.note}>
                Create a login so this supplier can receive requirements and reply with quotations.
              </Text>
              <Field label="Login email" value={login.email} onChangeText={(v) => setLogin((l) => ({ ...l, email: v }))} placeholder="supplier@example.com" autoCapitalize="none" keyboardType="email-address" />
              <Field label="Temporary password" value={login.password} onChangeText={(v) => setLogin((l) => ({ ...l, password: v }))} placeholder="Share this with the supplier" secureTextEntry />
              <Button title="Create supplier login" onPress={createLogin} loading={creatingLogin} />
            </Card>
          )}
        </View>
      ) : null}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  id: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: spacing.md },
  note: { fontSize: 13, color: colors.muted, marginBottom: spacing.md },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  loginOk: { fontSize: 15, fontWeight: '800', color: colors.success },
  loginEmail: { fontSize: 15, color: colors.text, marginTop: 2, marginBottom: 4 },
});
