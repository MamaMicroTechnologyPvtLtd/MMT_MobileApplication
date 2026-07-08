import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Button, Field, Card, Badge } from '../../components/ui';
import CredentialsCard from '../../components/CredentialsCard';
import { colors, spacing, radius } from '../../theme';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', listing_engineer: 'Listing Engineer' };

// Admin/Manager: create employee logins (esp. Listing Engineers) and hand over
// credentials; Admin can also change roles / reset passwords.
export default function StaffScreen() {
  const { user } = useAuth();
  const isAdmin = user?.staff_role === 'admin';
  const roleOptions = isAdmin ? ['listing_engineer', 'manager', 'admin'] : ['listing_engineer'];

  const [staff, setStaff] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', password: '' });
  const [role, setRole] = useState('listing_engineer');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // { username, password }

  const load = useCallback(async () => {
    try { setStaff(await api('/staff')); } catch (e) { Alert.alert('Error', e.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!form.email.trim()) { Alert.alert('Email needed', 'Enter the employee’s company email.'); return; }
    setCreating(true);
    try {
      const res = await api('/staff', { method: 'POST', body: { ...form, email: form.email.trim(), staff_role: role } });
      setCreated(res.credentials);
      setForm({ email: '', full_name: '', password: '' });
      setRole('listing_engineer');
      await load();
    } catch (e) { Alert.alert('Could not create', e.message); }
    finally { setCreating(false); }
  };

  const changeRole = async (id, newRole) => {
    try { await api(`/staff/${id}/role`, { method: 'PATCH', body: { staff_role: newRole } }); await load(); }
    catch (e) { Alert.alert('Error', e.message); }
  };

  const resetPassword = async (id) => {
    try {
      const res = await api(`/staff/${id}/reset-password`, { method: 'POST', body: {} });
      setCreated(res.credentials);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.h1}>Employees</Text>
      <Text style={styles.sub}>Create logins for listing engineers{isAdmin ? ', managers and admins' : ''} and hand over the credentials.</Text>

      {created ? (
        <View>
          <Text style={styles.ok}>✓ Login created</Text>
          <CredentialsCard username={created.username} password={created.password} />
          <Button title="Done" onPress={() => setCreated(null)} />
          <View style={{ height: spacing.lg }} />
        </View>
      ) : (
        <Card>
          <Text style={styles.section}>Add employee</Text>
          <Field label="Company email" value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="name@mamamicrotechnology.com" autoCapitalize="none" keyboardType="email-address" />
          <Field label="Full name" value={form.full_name} onChangeText={(v) => setForm((f) => ({ ...f, full_name: v }))} placeholder="Employee name" />
          <Text style={styles.label}>Role</Text>
          <View style={styles.seg}>
            {roleOptions.map((r) => (
              <TouchableOpacity key={r} onPress={() => setRole(r)} style={[styles.segItem, role === r && styles.segItemOn]}>
                <Text style={[styles.segText, role === r && styles.segTextOn]}>{ROLE_LABEL[r]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Field label="Password (optional — auto-generated if blank)" value={form.password} onChangeText={(v) => setForm((f) => ({ ...f, password: v }))} placeholder="Leave blank to auto-generate" autoCapitalize="none" />
          <Button title="Create employee login" onPress={create} loading={creating} />
        </Card>
      )}

      <Text style={styles.section}>Team</Text>
      {staff.map((s) => (
        <Card key={s.id}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{s.full_name || s.email}</Text>
              <Text style={styles.muted}>{s.email}</Text>
            </View>
            <Badge label={ROLE_LABEL[s.staff_role] || s.staff_role || '—'} />
          </View>
          {isAdmin ? (
            <View style={styles.actions}>
              {['listing_engineer', 'manager', 'admin'].filter((r) => r !== s.staff_role).map((r) => (
                <TouchableOpacity key={r} onPress={() => changeRole(s.id, r)} style={styles.mini}>
                  <Text style={styles.miniText}>Make {ROLE_LABEL[r]}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => resetPassword(s.id)} style={[styles.mini, styles.miniWarn]}>
                <Text style={[styles.miniText, { color: colors.warning }]}>Reset password</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Card>
      ))}
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: spacing.lg, lineHeight: 18 },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  ok: { fontSize: 18, fontWeight: '800', color: colors.success, marginBottom: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  seg: { flexDirection: 'row', gap: 8, marginBottom: spacing.md, flexWrap: 'wrap' },
  segItem: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  segTextOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  mini: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  miniWarn: { borderColor: colors.warning },
  miniText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
});
