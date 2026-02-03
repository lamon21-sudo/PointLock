import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Input } from '../src/components/ui/Input';
import { PasswordInput } from '../src/components/ui/PasswordInput';
import { Button } from '../src/components/ui/Button';
import { FormError } from '../src/components/auth/FormError';
import { AuthService } from '../src/services/auth.service';
import { loginSchema, type LoginFormData } from '../src/schemas/auth.schemas';

/**
 * Login Screen
 *
 * Handles user authentication. Navigation to the main app is handled automatically
 * by the root layout's navigation guards once isAuthenticated becomes true.
 *
 * Design notes:
 * - The form's isSubmitting state controls the button loading indicator
 * - The auth store's isLoading state is used internally for token persistence
 * - Navigation happens automatically via the navigation guard, not router.replace
 * - This prevents race conditions and ensures smooth transitions
 */
export default function LoginScreen() {
  const [apiError, setApiError] = useState<string>('');

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setApiError('');
      await AuthService.login(data);

      // Navigation to /(tabs) will happen automatically via the navigation guard
      // in _layout.tsx once isAuthenticated becomes true. No manual navigation needed.
    } catch (error: any) {
      setApiError(error.message || 'Login failed. Please try again.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 py-8 justify-center">
            {/* Header */}
            <View className="mb-8">
              <Text className="text-4xl font-bold text-text-primary mb-2">
                Welcome Back
              </Text>
              <Text className="text-base text-text-secondary">
                Sign in to your PickRivals account
              </Text>
            </View>

            {/* Form Error */}
            <FormError message={apiError} />

            {/* Login Form */}
            <View className="space-y-4">
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Email"
                    placeholder="Enter your email"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.email?.message}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <PasswordInput
                    label="Password"
                    placeholder="Enter your password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.password?.message}
                    autoComplete="password"
                    textContentType="password"
                  />
                )}
              />

              {/* Forgot Password Link */}
              <TouchableOpacity
                className="self-end"
                activeOpacity={0.7}
                onPress={() => {
                  // TODO: Navigate to forgot password screen
                  console.log('Forgot password pressed');
                }}
              >
                <Text className="text-primary text-sm font-medium">
                  Forgot Password?
                </Text>
              </TouchableOpacity>

              {/* Login Button */}
              <Button
                onPress={handleSubmit(onSubmit)}
                isLoading={isSubmitting}
                fullWidth
                className="mt-2"
              >
                Sign In
              </Button>
            </View>

            {/* Sign Up Link */}
            <View className="flex-row justify-center items-center mt-8">
              <Text className="text-text-secondary text-sm">
                Don't have an account?{' '}
              </Text>
              <Link href={"/register" as any} asChild replace>
                <TouchableOpacity activeOpacity={0.7}>
                  <Text className="text-primary text-sm font-semibold">
                    Create Account
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
