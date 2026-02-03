// =====================================================
// ⚠️  CRITICAL CONFIGURATION FOR PHYSICAL DEVICES  ⚠️
// =====================================================
// Set this to your machine's LAN IP address for physical device testing
//
// HOW TO FIND YOUR IP:
// - Windows: Open CMD and run 'ipconfig' - look for IPv4 Address
// - Mac/Linux: Open Terminal and run 'ifconfig' or 'ip addr' - look for inet
// - Should look like: 192.168.1.XXX or 10.0.0.XXX
//
// IMPORTANT:
// - DO NOT use 'localhost' or '127.0.0.1' - those won't work on physical devices
// - DO NOT use '10.0.2.2' - that's only for Android emulator
// - Your phone/tablet must be on the SAME Wi-Fi network as your computer
// - Ensure your firewall allows incoming connections on port 3000

const LOCAL_DEV_IP = "192.168.1.175"; // <--- Use YOUR IPv4 address here

module.exports = {
  expo: {
    name: "POINTLOCK",
    slug: "pointlock",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "pointlock",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0A0A0A",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.pointlock.app",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0A0A0A",
      },
      package: "com.pointlock.app",
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-font",
      [
        "expo-notifications",
        {
          color: "#D4AF37",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "4c507a93-062e-4a9e-8956-343e6e1d049f",
      },
      // API URL for development - uses your local machine's IP
      // This allows physical devices to reach your backend
      apiUrl: process.env.API_URL || `http://${LOCAL_DEV_IP}:3000/api/v1`,
    },
  },
};
