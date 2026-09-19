import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.soylai.forms',
  appName: 'SOYL Forms',
  webDir: 'out',
  server: {
    // In production the WebView loads the deployed site.
    // Override locally with CAP_SERVER_URL=http://<your-LAN-ip>:3000
    ...(serverUrl ? { url: serverUrl } : { url: 'https://forms.soylai.com' }),
    // Allow navigation within the SOYL domain so App Links stay in-app.
    allowNavigation: ['forms.soylai.com'],
  },
  android: {
    // Use hardware back button for in-app navigation.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
