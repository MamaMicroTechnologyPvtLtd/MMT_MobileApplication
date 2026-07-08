import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { colors } from './src/theme';
import ProfileButton from './src/components/ProfileButton';

// Auth
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

// Shared
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';

// Customer
import EnquiryScreen from './src/screens/EnquiryScreen';
import QuotationsScreen from './src/screens/QuotationsScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';

// Internal
import DashboardScreen from './src/screens/internal/DashboardScreen';
import InternalEnquiriesScreen from './src/screens/internal/EnquiriesScreen';
import OrdersScreen from './src/screens/internal/OrdersScreen';
import OrderDetailScreen from './src/screens/internal/OrderDetailScreen';
import SendRequirementScreen from './src/screens/internal/SendRequirementScreen';
import QuoteCustomerScreen from './src/screens/internal/QuoteCustomerScreen';
import CreateDeliveryScreen from './src/screens/internal/CreateDeliveryScreen';
import ManagePaymentsScreen from './src/screens/internal/ManagePaymentsScreen';
import ManageDeliveryScreen from './src/screens/internal/ManageDeliveryScreen';
import DirectoryScreen from './src/screens/internal/DirectoryScreen';
import CustomerFormScreen from './src/screens/internal/CustomerFormScreen';
import SupplierFormScreen from './src/screens/internal/SupplierFormScreen';

// Supplier
import SupplierRequirementsScreen from './src/screens/supplier/SupplierRequirementsScreen';
import SupplierReplyScreen from './src/screens/supplier/SupplierReplyScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabIcon = (emoji) => ({ focused }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

const baseTabScreenOptions = (navigation) => ({
  headerRight: () => <ProfileButton navigation={navigation} />, // profile top-right
  headerTitleStyle: { fontWeight: '800' },
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
});

// --- Customer: form first, quotations next, history last ---------------------
function CustomerTabs({ navigation }) {
  return (
    <Tab.Navigator screenOptions={baseTabScreenOptions(navigation)}>
      <Tab.Screen name="Enquiry" component={EnquiryScreen} options={{ title: 'Send Enquiry', tabBarIcon: tabIcon('📝') }} />
      <Tab.Screen name="Quotations" component={QuotationsScreen} options={{ title: 'Quotations', tabBarIcon: tabIcon('📄') }} />
      <Tab.Screen name="Payments" component={PaymentsScreen} options={{ title: 'Payments', tabBarIcon: tabIcon('💳') }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'History', tabBarIcon: tabIcon('🕑') }} />
    </Tab.Navigator>
  );
}

// --- Internal (MAM Home): enquiries top, orders/comparison, directory, history -
function InternalTabs({ navigation }) {
  return (
    <Tab.Navigator screenOptions={baseTabScreenOptions(navigation)}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard', tabBarIcon: tabIcon('📊') }} />
      <Tab.Screen name="Enquiries" component={InternalEnquiriesScreen} options={{ title: 'Enquiries', tabBarIcon: tabIcon('📥') }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Orders', tabBarIcon: tabIcon('📦') }} />
      <Tab.Screen name="Directory" component={DirectoryScreen} options={{ title: 'Directory', tabBarIcon: tabIcon('📇') }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'History', tabBarIcon: tabIcon('🕑') }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register' }} />
    </Stack.Navigator>
  );
}

function CustomerStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={CustomerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'My Profile' }} />
    </Stack.Navigator>
  );
}

function InternalStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={InternalTabs} options={{ headerShown: false }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Order & Comparison' }} />
      <Stack.Screen name="SendRequirement" component={SendRequirementScreen} options={{ title: 'Send Requirement' }} />
      <Stack.Screen name="QuoteCustomer" component={QuoteCustomerScreen} options={{ title: 'Quote Customer' }} />
      <Stack.Screen name="CreateDelivery" component={CreateDeliveryScreen} options={{ title: 'Create Delivery' }} />
      <Stack.Screen name="ManagePayments" component={ManagePaymentsScreen} options={{ title: 'Payments' }} />
      <Stack.Screen name="ManageDelivery" component={ManageDeliveryScreen} options={{ title: 'Manage Delivery' }} />
      <Stack.Screen name="Directory" component={DirectoryScreen} options={{ title: 'Directory' }} />
      <Stack.Screen name="CustomerForm" component={CustomerFormScreen} options={{ title: 'Customer' }} />
      <Stack.Screen name="SupplierForm" component={SupplierFormScreen} options={{ title: 'Supplier' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'My Profile' }} />
    </Stack.Navigator>
  );
}

// --- Supplier: requirements inbox + reply, alerts, profile top-right ---------
function SupplierTabs({ navigation }) {
  return (
    <Tab.Navigator screenOptions={baseTabScreenOptions(navigation)}>
      <Tab.Screen name="Requirements" component={SupplierRequirementsScreen} options={{ title: 'Requirements', tabBarIcon: tabIcon('📥') }} />
      <Tab.Screen name="Alerts" component={HistoryScreen} options={{ title: 'Alerts', tabBarIcon: tabIcon('🔔') }} />
    </Tab.Navigator>
  );
}

function SupplierStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={SupplierTabs} options={{ headerShown: false }} />
      <Stack.Screen name="SupplierReply" component={SupplierReplyScreen} options={{ title: 'Reply' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'My Profile' }} />
    </Stack.Navigator>
  );
}

function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <AuthStack />;
  if (user.role === 'internal') return <InternalStack />;
  if (user.role === 'supplier') return <SupplierStack />;
  return <CustomerStack />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
