import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { Card, Badge, EmptyState } from '../components/ui';
import { colors, spacing, radius } from '../theme';

// History, shown category-wise (per the customer spec): send-enquiry history,
// received-quotation history, delivery-status history, payments history, and
// notifications/offers history.
const CATEGORIES = [
  { key: 'enquiries', label: 'Enquiries', icon: '📝', path: '/enquiries' },
  { key: 'quotations', label: 'Quotations', icon: '📄', path: '/quotations' },
  { key: 'deliveries', label: 'Deliveries', icon: '🚚', path: '/deliveries' },
  { key: 'payments', label: 'Payments', icon: '💳', path: '/payments' },
  { key: 'notifications', label: 'Offers', icon: '🔔', path: '/notifications' },
];

const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function HistoryScreen() {
  const [active, setActive] = useState('enquiries');
  const [data, setData] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (key) => {
    const cat = CATEGORIES.find((c) => c.key === key);
    setLoading(true);
    try {
      setData(await api(cat.path));
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(active); }, [active, load]));

  const renderRow = ({ item }) => {
    switch (active) {
      case 'enquiries':
        return (
          <Card>
            <Head id={item.enquiry_id} status={item.status} />
            <Text style={styles.title}>{item.subject || item.category || 'Enquiry'}</Text>
            <Text style={styles.body} numberOfLines={2}>{item.message}</Text>
            <Text style={styles.meta}>{fmt(item.created_at)}</Text>
          </Card>
        );
      case 'quotations':
        return (
          <Card>
            <Head id={item.quotation_id} status={item.status} />
            <Text style={styles.title}>Total {money(item.total_amount)}</Text>
            <Text style={styles.body}>{item.subject || item.requirement || ''}</Text>
            <Text style={styles.meta}>{fmt(item.created_at)}</Text>
          </Card>
        );
      case 'deliveries':
        return (
          <Card>
            <Head id={item.delivery_id} status={item.status} />
            <Text style={styles.title}>{item.delivery_location || item.district || 'Delivery'}</Text>
            <Text style={styles.body}>
              {[item.vehicle_number, item.driver_name, item.driver_number].filter(Boolean).join(' • ')}
            </Text>
            <Text style={styles.meta}>Order {item.order_id} · {fmt(item.created_at)}</Text>
          </Card>
        );
      case 'payments':
        return (
          <Card>
            <Head id={`#${item.id}`} status={item.status} />
            <Text style={styles.title}>{money(item.amount)} · {item.type}</Text>
            <Text style={styles.body}>{[item.method, item.reference].filter(Boolean).join(' • ')}</Text>
            <Text style={styles.meta}>{item.order_id || item.delivery_id || ''} · {fmt(item.created_at)}</Text>
          </Card>
        );
      case 'notifications':
        return (
          <Card>
            <View style={styles.notifTop}>
              <Text style={styles.notifDot}>{item.is_read ? '○' : '●'}</Text>
              <Text style={styles.title}>{item.title}</Text>
            </View>
            {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
            <Text style={styles.meta}>{fmt(item.created_at)}</Text>
          </Card>
        );
      default:
        return null;
    }
  };

  const keyFor = (item, i) =>
    item.enquiry_id || item.quotation_id || item.delivery_id || String(item.id) || String(i);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ paddingHorizontal: spacing.md }}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.key}
            onPress={() => setActive(c.key)}
            style={[styles.tab, active === c.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, active === c.key && styles.tabTextActive]}>{c.icon}  {c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        data={data}
        keyExtractor={keyFor}
        renderItem={renderRow}
        ListEmptyComponent={
          loading ? null : <EmptyState title="Nothing here yet" subtitle="This history category is empty." />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(active); setRefreshing(false); }} />}
      />
    </View>
  );
}

function Head({ id, status }) {
  return (
    <View style={styles.head}>
      <Text style={styles.hid}>{id}</Text>
      {status ? <Badge label={status} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { maxHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  tab: {
    paddingHorizontal: 14, height: 40, borderRadius: radius.pill, marginRight: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
    alignSelf: 'center', borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  tabTextActive: { color: '#fff' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  hid: { fontSize: 13, fontWeight: '800', color: colors.primary },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.muted, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
  notifTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifDot: { color: colors.primary, fontSize: 12 },
});
