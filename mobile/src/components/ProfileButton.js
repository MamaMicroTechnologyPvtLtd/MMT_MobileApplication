import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

// Circular avatar shown at the top-right of every main screen. Tapping it
// opens the Profile screen (registered + logged-in user details).
export default function ProfileButton({ navigation }) {
  const { user, profile } = useAuth();
  const name = profile?.first_name || user?.full_name || user?.email || '?';
  const initials = name.trim().slice(0, 1).toUpperCase();
  return (
    <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Profile')}>
      <Text style={styles.initials}>{initials}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  initials: { color: colors.primaryDark, fontWeight: '800', fontSize: 16 },
});
