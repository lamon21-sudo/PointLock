import { View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CrosshairIcon } from 'phosphor-react-native';

export default function WelcomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        {/* Logo Area */}
        <View className="mb-8">
          <CrosshairIcon size={64} color="#D4AF37" weight="duotone" />
        </View>

        {/* Title */}
        <Text className="text-4xl font-bold text-white mb-2">
          PickRivals
        </Text>

        <Text className="text-lg text-gray-400 text-center mb-12">
          Beat your friends. Build your legacy.
        </Text>

        {/* Tagline */}
        <View className="bg-surface rounded-2xl p-6 mb-12 w-full">
          <Text className="text-primary text-center text-lg font-semibold mb-2">
            Skill-Based PvP Predictions
          </Text>
          <Text className="text-gray-400 text-center">
            Don't beat the odds — beat your friends in head-to-head sports prediction battles.
          </Text>
        </View>

        {/* API Status */}
        <View className="bg-surface-elevated rounded-xl p-4 mb-8 w-full">
          <Text className="text-white font-semibold mb-2">
            Hello World — Mobile App Running!
          </Text>
          <Text className="text-gray-400 text-sm">
            React Native (Expo) + NativeWind configured successfully.
          </Text>
        </View>

        {/* CTA Button */}
        <Link href="/(tabs)" asChild>
          <Pressable className="bg-primary w-full py-4 rounded-xl active:opacity-80">
            <Text className="text-white text-center font-bold text-lg">
              Enter the Arena
            </Text>
          </Pressable>
        </Link>

        {/* Version */}
        <Text className="text-gray-600 text-sm mt-8">
          v0.1.0 — MVP Development Build
        </Text>
      </View>
    </SafeAreaView>
  );
}
