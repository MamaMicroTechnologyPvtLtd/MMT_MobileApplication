import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fileUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, EmptyState } from '../components/ui';
import { colors, spacing, radius } from '../theme';

// History, shown category-wise. Customers see received-quotation history; the
// internal team sees the orders feed in its place.
const CUSTOMER_CATEGORIES = [
  { key: 'enquiries', label: 'Enquiries', icon: '📝', path: '/enquiries' },
  { key: 'quotations', label: 'Quotations', icon: '📄', path: '/quotations' },
  { key: 'deliveries', label: 'Deliveries', icon: '🚚', path: '/deliveries' },
  { key: 'payments', label: 'Payments', icon: '💳', path: '/payments' },
  { key: 'notifications', label: 'Offers', icon: '🔔', path: '/notifications' },
];
const INTERNAL_CATEGORIES = [
  { key: 'enquiries', label: 'Enquiries', icon: '📝', path: '/enquiries' },
  { key: 'orders', label: 'Orders', icon: '📦', path: '/orders' },
  { key: 'deliveries', label: 'Deliveries', icon: '🚚', path: '/deliveries' },
  { key: 'payments', label: 'Payments', icon: '💳', path: '/payments' },
  { key: 'notifications', label: 'Alerts', icon: '🔔', path: '/notifications' },
];
const SUPPLIER_CATEGORIES = [
  { key: 'notifications', label: 'Alerts', icon: '🔔', path: '/notifications' },
];

const categoriesForRole = (role) => {
  if (role === 'internal') return INTERNAL_CATEGORIES;
  if (role === 'supplier') return SUPPLIER_CATEGORIES;
  return CUSTOMER_CATEGORIES;
};

const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function HistoryScreen() {
  const { user } = useAuth();
  const CATEGORIES = categoriesForRole(user?.role);
  const [active, setActive] = useState(CATEGORIES[0].key);
  const [data, setData] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (key) => {
    const cat = categoriesForRole(user?.role).find((c) => c.key === key);
    if (!cat) return;
    setLoading(true);
    try {
      setData(await api(cat.path));
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

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
      case 'orders':
        return (
          <Card>
            <Head id={item.order_id} status={item.status} />
            <Text style={styles.title}>{[item.first_name, item.last_name].filter(Boolean).join(' ') || item.customer_id}</Text>
            <Text style={styles.body} numberOfLines={2}>{item.requirement || '—'}</Text>
            <Text style={styles.meta}>{item.quotes_count || 0} quotes · {fmt(item.created_at)}</Text>
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
            {(item.truck_image_url || item.truck_video_url || item.invoice_url) ? (
              <View style={styles.links}>
                {item.truck_image_url ? <Link label="📷 Truck photo" url={item.truck_image_url} /> : null}
                {item.truck_video_url ? <Link label="🎥 Truck video" url={item.truck_video_url} /> : null}
                {item.invoice_url ? <Link label="🧾 Invoice" url={item.invoice_url} /> : null}
              </View>
            ) : null}
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
    item.enquiry_id || item.quotation_id || item.order_id || item.delivery_id
    || (item.id != null ? String(item.id) : String(i));

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

function Link({ label, url }) {
  return (
    <Text style={styles.link} onPress={() => Linking.openURL(fileUrl(url))}>{label}</Text>
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
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 6 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});

