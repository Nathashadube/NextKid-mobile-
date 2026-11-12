import { Tabs } from 'expo-router';
import { Home, Tag, ShoppingBag, Bell, User, Heart } from 'lucide-react-native';

const CRIMSON  = '#BE1E2D';
const INACTIVE = '#979797';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#dedede',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: CRIMSON,
        tabBarInactiveTintColor: INACTIVE,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home size={30} strokeWidth={2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Sell',
          tabBarIcon: ({ color }) => <Tag size={30} strokeWidth={2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => <ShoppingBag size={30} strokeWidth={2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: 'Wishlist',
          tabBarIcon: ({ color, focused }) => <Heart size={30} strokeWidth={2} color={CRIMSON} fill={focused ? CRIMSON : 'none'} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <Bell size={30} strokeWidth={2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User size={30} strokeWidth={2} color={color} />,
        }}
      />
    </Tabs>
  );
}
