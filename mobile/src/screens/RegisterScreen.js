import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, Field } from '../components/ui';
import { colors, spacing } from '../theme';

// Employee (internal) registration ONLY. Customers and suppliers do not
// self-register — they are onboarded by an internal member who issues their
// ID + password.
export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const onRegister = async () => {
    if (!form.email || !form.password) {
      Alert.alert('Missing details', 'Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim(), role: 'internal' });
    } catch (e) {
      Alert.alert('Registration failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Employee registration</Text>
        <Text style={styles.subtitle}>
          For MMT (MAMA Home) company employees only. Customers and suppliers receive their login
          credentials from the internal team.
        </Text>

        <Field label="Full name" value={form.full_name} onChangeText={set('full_name')} placeholder="Your name" />
        <Field label="Work email" value={form.email} onChangeText={set('email')} placeholder="you@mmt.com" autoCapitalize="none" keyboardType="email-address" />
        <Field label="Mobile number" value={form.phone} onChangeText={set('phone')} placeholder="10-digit mobile" keyboardType="phone-pad" />
        <Field label="Password" value={form.password} onChangeText={set('password')} placeholder="Choose a password" secureTextEntry />

        <Button title="Create employee account" onPress={onRegister} loading={loading} />

        <View style={styles.row}>
          <Text style={styles.muted}>Already have an account?</Text>
          <Text style={styles.link} onPress={() => navigation.goBack()}> Log in</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: spacing.xl, marginTop: 4, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  muted: { color: colors.muted },
  link: { color: colors.primary, fontWeight: '700' },
});
