import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gimeet.app',
  appName: 'GI Meet',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#12433D', // matches the brand's deep teal
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#12433D',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;