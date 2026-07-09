import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState } from '../../components/ui';
import { colors, spacing, radius, fmtDateTime as fmt } from '../../theme';

// Internal: the full project + order history for one customer, including
// everything imported from the old software (2018 onwards).
export default function CustomerHistoryScreen({ route, navigation }) {
  const { customerId, name } = route.params || {};
  const [tab, setTab] = useState('projects');
  const [data, setData] = useState({ projects: [], orders: [] });
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: name ? `${name} · History` : 'Customer History' });
  }, [navigation, name]);

  const load = useCallback(async () => {
    try { setData(await api(`/customers/${customerId}/history`)); }
    catch { setData({ projects: [], orders: [] }); }
  }, [customerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items = tab === 'projects' ? data.projects : data.orders;

  const renderProject = ({ item }) => (
    <Card>
      <View style={styles.top}>
        <Text style={styles.id}>{item.project_id}</Text>
        <Text style={styles.count}>{item.orders_count || 0} orders</Text>
      </View>
      {item.ward ? <Text style={styles.body}>Ward: {item.ward}</Text> : null}
      <Text style={styles.meta}>{fmt(item.created_at)}</Text>
    </Card>
  );

  const renderOrder = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('OrderDetail', { orderId: item.order_id })}>
      <Card>
        <View style={styles.top}>
          <Text style={styles.id}>{item.order_id}</Text>
          <Badge label={item.status} />
        </View>
        <Text style={styles.body} numberOfLines={2}>{item.requirement || '—'}</Text>
        <Text style={styles.meta}>
          {[item.category, item.subcategory].filter(Boolean).join(' › ')}
          {item.project_id ? ` · ${item.project_id}` : ''} · {fmt(item.created_at)}
        </Text>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.tabs}>
        {[['projects', `Projects (${data.projects.length})`], ['orders', `Orders (${data.orders.length})`]].map(([t, label]) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        data={items}
        keyExtractor={(x) => x.project_id || x.order_id}
        renderItem={tab === 'projects' ? renderProject : renderOrder}
        ListEmptyComponent={<EmptyState icon="🕑" title="No history" subtitle="No records found for this customer." />}
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
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  id: { fontSize: 13, fontWeight: '800', color: colors.primary },
  count: { fontSize: 12, fontWeight: '700', color: colors.muted, backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  body: { fontSize: 14, color: colors.text, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
});
