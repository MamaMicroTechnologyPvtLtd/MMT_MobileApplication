import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Card, Button, EmptyState } from '../../components/ui';
import { colors, spacing, radius } from '../../theme';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', listing_engineer: 'Listing Engineer' };

// Directory: choose an existing customer/supplier/employee to EDIT (keep details
// up to date), or ADD a new one (continues the C/S id series).
export default function DirectoryScreen({ navigation, route }) {
  const [tab, setTab] = useState(route?.params?.tab || 'customers');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Honour the tab passed in from Dashboard drilldowns.
  React.useEffect(() => {
    if (route?.params?.tab && route.params.tab !== tab) {
      setTab(route.params.tab);
      setItems([]);
    }
  }, [route?.params?.tab]);

  const load = useCallback(async () => {
    try {
      if (tab === 'employees') {
        const staff = await api('/staff');
        const needle = q.trim().toLowerCase();
        setItems(needle
          ? staff.filter((s) => `${s.full_name || ''} ${s.email || ''}`.toLowerCase().includes(needle))
          : staff);
        return;
      }
      const isPin = /^\d{5,6}$/.test(q.trim());
      const params = q.trim() ? (isPin ? `pincode=${q.trim()}` : `q=${encodeURIComponent(q.trim())}`) : '';
      setItems(await api(`/${tab}?${params}`));
    } catch {
      setItems([]);
    }
  }, [tab, q]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderCustomer = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('CustomerForm', { customer: item })}>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{[item.first_name, item.last_name].filter(Boolean).join(' ') || '—'}</Text>
            <Text style={styles.meta}>{[item.mobile_num, item.city, item.pincode].filter(Boolean).join(' · ') || 'No contact details'}</Text>
          </View>
          <Text style={styles.id}>{item.customer_id}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderSupplier = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('SupplierForm', { supplier: item })}>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.supplier_firm_name || '—'}</Text>
            <Text style={styles.meta}>{[item.contact_person_name, item.city, item.pincode, item.mobile].filter(Boolean).join(' · ') || 'No details'}</Text>
          </View>
          <Text style={styles.id}>{item.supplier_id}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderEmployee = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('Staff')}>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.full_name || item.email}</Text>
            <Text style={styles.meta}>{item.email}</Text>
          </View>
          <Text style={styles.id}>{ROLE_LABEL[item.staff_role] || item.staff_role || '—'}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderItem = tab === 'customers' ? renderCustomer : tab === 'suppliers' ? renderSupplier : renderEmployee;
  const addLabel = tab === 'customers' ? '+ Add new customer' : tab === 'suppliers' ? '+ Add new supplier' : '+ Add new employee';
  const goAdd = () => {
    if (tab === 'customers') navigation.navigate('CustomerForm', {});
    else if (tab === 'suppliers') navigation.navigate('SupplierForm', {});
    else navigation.navigate('Staff');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.tabs}>
        {['customers', 'suppliers', 'employees'].map((t) => (
          <TouchableOpacity key={t} onPress={() => { setTab(t); setItems([]); }} style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'customers' ? 'Customers' : t === 'suppliers' ? 'Suppliers' : 'Employees'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.linkRow}>
        <TouchableOpacity onPress={() => navigation.navigate('ManageCategories')}>
          <Text style={styles.catLinkText}>⚙ Categories ›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={tab === 'employees' ? 'Search employee name / email' : 'Search name / id, or pincode'}
          placeholderTextColor={colors.muted}
          style={styles.input}
          onSubmitEditing={load}
          returnKeyType="search"
        />
        <Button title="Go" onPress={load} style={{ paddingHorizontal: 18 }} />
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <Button title={addLabel} variant="ghost" onPress={goAdd} />
      </View>

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        data={items}
        keyExtractor={(x) => x.customer_id || x.supplier_id || String(x.id)}
        renderItem={renderItem}
        ListEmptyComponent={<EmptyState icon="🔎" title="Nothing to show" subtitle="Search or add a new record." />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.muted },
  tabTextOn: { color: colors.primary },
  linkRow: { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  catLinkText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  id: { fontSize: 11, color: colors.muted, fontWeight: '700' },
});
