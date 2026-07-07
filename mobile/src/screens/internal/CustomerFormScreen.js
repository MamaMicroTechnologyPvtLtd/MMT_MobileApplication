import React, { useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { api } from '../../api/client';
import { Button, Field, Card } from '../../components/ui';
import CredentialsCard from '../../components/CredentialsCard';
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

// Add a new customer (continues the C-series, and issues an ID + password login)
// or EDIT an existing one to keep region/contact details up to date.
export default function CustomerFormScreen({ route, navigation }) {
  const existing = route.params?.customer;
  const isEdit = !!existing;
  const [form, setForm] = useState(() => {
    const init = {};
    FIELDS.forEach(([k]) => { init[k] = existing?.[k] ? String(existing[k]) : ''; });
    return init;
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // { username, password } after add
  const [account, setAccount] = useState(null);
  const [resetCreds, setResetCreds] = useState(null);
  const [resetting, setResetting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? `Edit ${existing.customer_id}` : 'Add customer' });
  }, [navigation, isEdit, existing]);

  const loadAccount = useCallback(async () => {
    if (!isEdit) return;
    try { setAccount(await api(`/customers/${existing.customer_id}/account`)); } catch { /* ignore */ }
  }, [isEdit, existing]);
  useEffect(() => { loadAccount(); }, [loadAccount]);

  const submit = async () => {
    const body = {};
    Object.entries(form).forEach(([k, v]) => { if (v !== '') body[k] = v; });
    if (!isEdit && !body.first_name && !body.mobile_num) {
      Alert.alert('Details needed', 'Enter at least a name or mobile number.');
      return;
    }
    if (!isEdit && password) body.password = password;
    setSaving(true);
    try {
      if (isEdit) {
        await api(`/customers/${existing.customer_id}`, { method: 'PUT', body });
        Alert.alert('Updated', existing.customer_id, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        const saved = await api('/customers', { method: 'POST', body });
        // Show the issued login (ID + password) so the employee can share it.
        setCreated(saved.credentials);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    setResetting(true);
    try {
      const res = await api(`/customers/${existing.customer_id}/account`, { method: 'POST', body: {} });
      setResetCreds(res.credentials);
      loadAccount();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setResetting(false);
    }
  };

  // After creating a customer, show the credentials prominently.
  if (created) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.successTitle}>✓ Customer created</Text>
        <Text style={styles.note}>Share these login credentials with the customer. The password is shown only once.</Text>
        <CredentialsCard username={created.username} password={created.password} />
        <Button title="Done" onPress={() => navigation.goBack()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      {isEdit ? <Text style={styles.id}>{existing.customer_id}</Text> : (
        <Text style={styles.note}>A new customer ID will be assigned automatically, continuing the series. A login (ID + password) is created for the customer.</Text>
      )}
      <Card>
        {FIELDS.map(([k, label, kb]) => (
          <Field key={k} label={label} value={form[k]} onChangeText={set(k)} keyboardType={kb} autoCapitalize={k === 'email' ? 'none' : 'sentences'} />
        ))}
        {!isEdit ? (
          <Field label="Login password (optional — auto-generated if blank)" value={password} onChangeText={setPassword} placeholder="Leave blank to auto-generate" autoCapitalize="none" />
        ) : null}
      </Card>
      <Button title={isEdit ? 'Save changes' : 'Add customer'} onPress={submit} loading={saving} />

      {isEdit ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={styles.h2}>Customer login</Text>
          {resetCreds ? (
            <CredentialsCard username={resetCreds.username} password={resetCreds.password} note="New password — shown once." />
          ) : (
            <Card>
              <Text style={styles.loginStatus}>
                {account?.has_login ? '✓ Login active' : 'No login yet'} — username: {existing.customer_id}
              </Text>
              <Text style={styles.note}>
                {account?.has_login ? 'Reset the password if the customer needs a new one.' : 'Create a login by resetting the password.'}
              </Text>
              <Button title={account?.has_login ? 'Reset password' : 'Create login'} variant="ghost" onPress={resetPassword} loading={resetting} />
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
  note: { fontSize: 13, color: colors.muted, marginBottom: spacing.md, lineHeight: 18 },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  successTitle: { fontSize: 20, fontWeight: '800', color: colors.success, marginBottom: spacing.sm },
  loginStatus: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
});
