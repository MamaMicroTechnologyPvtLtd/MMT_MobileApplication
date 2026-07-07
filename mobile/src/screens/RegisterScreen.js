import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, Field } from '../components/ui';
import { colors, spacing } from '../theme';

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
      await register({ ...form, email: form.email.trim(), role: 'customer' });
      // On success AuthProvider sets the user and the app switches to the main stack.
    } catch (e) {
      Alert.alert('Registration failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          You&apos;ll be registered as a customer. A customer ID is assigned automatically.
        </Text>

        <Field label="Full name" value={form.full_name} onChangeText={set('full_name')} placeholder="Your name" />
        <Field label="Email" value={form.email} onChangeText={set('email')} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
        <Field label="Mobile number" value={form.phone} onChangeText={set('phone')} placeholder="10-digit mobile" keyboardType="phone-pad" />
        <Field label="Password" value={form.password} onChangeText={set('password')} placeholder="Choose a password" secureTextEntry />

        <Button title="Create account" onPress={onRegister} loading={loading} />

        <View style={styles.row}>
          <Text style={styles.muted}>Already registered?</Text>
          <Text style={styles.link} onPress={() => navigation.goBack()}> Log in</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginBottom: spacing.xl, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  muted: { color: colors.muted },
  link: { color: colors.primary, fontWeight: '700' },
});
