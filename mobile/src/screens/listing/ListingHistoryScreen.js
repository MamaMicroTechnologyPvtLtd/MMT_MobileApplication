import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState } from '../../components/ui';
import { colors, spacing, radius } from '../../theme';

// Date + time capture for each listing the engineer has done.
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

const CATEGORIES = [
  { key: 'listings', label: 'My listings', icon: '📋' },
  { key: 'alerts', label: 'Alerts', icon: '🔔' },
];

// Listing Engineer History: every listing they've done (with date + time), and
// alerts/notifications from Admin or Manager on their tasks or updated listings.
export default function ListingHistoryScreen() {
  const [active, setActive] = useState('listings');
  const [data, setData] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (key) => {
    try {
      setData(await api(key === 'alerts' ? '/notifications' : '/listings'));
    } catch {
      setData([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(active); }, [active, load]));

  const renderListing = ({ item }) => (
    <Card>
      <View style={styles.top}>
        <Text style={styles.title}>{item.project_name || item.customer_name || 'Listing'}</Text>
        <Badge label={item.status} />
      </View>
      <Text style={styles.body}>
        {[item.customer_name, item.phone, item.location, item.pincode].filter(Boolean).join(' · ')}
      </Text>
      {item.requirement ? <Text style={styles.body} numberOfLines={2}>{item.requirement}</Text> : null}
      <Text style={styles.meta}>
        {[item.category, item.quantity, item.budget].filter(Boolean).join('  •  ')}
      </Text>
      <Text style={styles.stamp}>🗓 {fmtDate(item.listing_date)}  ·  🕑 {fmtTime(item.created_at)}</Text>
    </Card>
  );

  const renderAlert = ({ item }) => (
    <Card>
      <View style={styles.notifTop}>
        <Text style={styles.notifDot}>{item.is_read ? '○' : '●'}</Text>
        <Text style={styles.title}>{item.title}</Text>
      </View>
      {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
      <Text style={styles.stamp}>🗓 {fmtDate(item.created_at)}  ·  🕑 {fmtTime(item.created_at)}</Text>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.tabs}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c.key} onPress={() => setActive(c.key)} style={[styles.tab, active === c.key && styles.tabOn]}>
            <Text style={[styles.tabText, active === c.key && styles.tabTextOn]}>{c.icon}  {c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        data={data}
        keyExtractor={(x, i) => String(x.id ?? i)}
        renderItem={active === 'alerts' ? renderAlert : renderListing}
        ListEmptyComponent={
          <EmptyState
            icon={active === 'alerts' ? '🔔' : '📋'}
            title={active === 'alerts' ? 'No alerts yet' : 'No listings yet'}
            subtitle={active === 'alerts' ? 'Updates from Admin/Manager on your listings appear here.' : 'Listings you record will appear here with date and time.'}
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(active); setRefreshing(false); }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  tabTextOn: { color: colors.primary },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  body: { fontSize: 13, color: colors.muted, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 6 },
  stamp: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 6 },
  notifTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifDot: { color: colors.primary, fontSize: 12 },
});
