import React from 'react';

// This component defines the Android widget UI using react-native-android-widget
// It will be registered as a widget provider in app.json

// For now, export a placeholder that will be connected when
// react-native-android-widget is installed and configured
export interface TransitWidgetProps {
  stopName: string;
  arrivals: Array<{
    routeId: string;
    headsign: string;
    minsAway: number;
    isLive: boolean;
  }>;
  updatedAt: string;
  size: 'small' | 'medium';
}

// Widget task handler for react-native-android-widget
export async function widgetTaskHandler(props: any) {
  // This will be called by the Android widget system
  // Read widget data from SharedPreferences and render
  const { readWidgetData } = require('../../lib/widgetData');
  const data = await readWidgetData();
  return data;
}
