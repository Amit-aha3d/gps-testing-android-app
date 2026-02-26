import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PermissionsAndroid, Platform, StatusBar, Text } from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import GPSLiveDataScreen from './src/features/gps/screens/GPSLiveDataScreen';

type RootTabParamList = {
  Home: undefined;
  GPS: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const tabIconStyle = (focused: boolean) => ({
  fontSize: 18,
  color: focused ? '#0f766e' : '#64748b',
});

export default function App() {
  useEffect(() => {
    const requestLocationOnAppOpen = async () => {
      if (Platform.OS !== 'android') {
        return;
      }

      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'This app needs location permission to show GPS data.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
    };

    requestLocationOnAppOpen();
  }, []);

  return (
    <NavigationContainer>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerTitleAlign: 'center',
          tabBarActiveTintColor: '#0f766e',
          tabBarInactiveTintColor: '#64748b',
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 8 },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <Text style={tabIconStyle(focused)}>{'\u2302'}</Text>
            ),
          }}
        />
        <Tab.Screen
          name="GPS"
          component={GPSLiveDataScreen}
          options={{
            title: 'GPS',
            tabBarIcon: ({ focused }) => (
              <Text style={tabIconStyle(focused)}>{'\u25C9'}</Text>
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Settings',
            tabBarIcon: ({ focused }) => (
              <Text style={tabIconStyle(focused)}>{'\u2699'}</Text>
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
