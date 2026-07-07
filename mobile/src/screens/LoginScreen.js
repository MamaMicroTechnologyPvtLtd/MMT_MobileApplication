import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, Field } from '../components/ui';
import { colors, spacing } from '../theme';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!identifier || !password) {
      Alert.alert('Missing details', 'Enter your ID (or email) and password.');
      return;
    }
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (e) {
      Alert.alert('Login failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.logo}>MMT</Text>
          <Text style={styles.tag}>Mama Micro Technology</Text>
        </View>
        <Text style={styles.title}>Log in</Text>
        <Text style={styles.subtitle}>
          Customers &amp; suppliers: use the ID and password given by the MMT team.
          Employees: use your email.
        </Text>

        <Field
          label="ID or email"
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="e.g. MH_91_Z1_C1823 or you@mmt.com"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
        />
        <Button title="Log in" onPress={onLogin} loading={loading} />

        <View style={styles.row}>
          <Text style={styles.muted}>MMT employee?</Text>
          <Text style={styles.link} onPress={() => navigation.navigate('Register')}> Register here</Text>
        </View>
        <Text style={styles.help}>
          Don&apos;t have credentials? Customers and suppliers are onboarded by the MMT team — contact
          us to get your ID and password.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { fontSize: 44, fontWeight: '900', color: colors.primary, letterSpacing: 2 },
  tag: { fontSize: 14, color: colors.muted, marginTop: 4 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: spacing.xl, marginTop: 4, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  muted: { color: colors.muted },
  link: { color: colors.primary, fontWeight: '700' },
  help: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: spacing.lg, lineHeight: 17 },
});
