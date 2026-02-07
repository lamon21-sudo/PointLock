import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Input } from '../src/components/ui/Input';
import { PasswordInput } from '../src/components/ui/PasswordInput';
import { Button } from '../src/components/ui/Button';
import { FormError } from '../src/components/auth/FormError';
import { PasswordStrengthIndicator } from '../src/components/auth/PasswordStrengthIndicator';
import { AuthService } from '../src/services/auth.service';
import { useDebounce } from '../src/hooks/useDebounce';
import { registerSchema, type RegisterFormData } from '../src/schemas/auth.schemas';
import { TEST_IDS } from '../src/constants/testIds';

/**
 * Register Screen
 *
 * Handles new user registration with real-time validation feedback.
 * Navigation to the main app is handled automatically by the root layout's
 * navigation guards once isAuthenticated becomes true.
 *
 * Features:
 * - Real-time username availability checking with debouncing
 * - Password strength indicator with visual feedback
 * - Comprehensive form validation with Zod schema
 * - Automatic navigation after successful registration
 *
 * Design notes:
 * - Username checks are debounced by 300ms to reduce API calls
 * - The form's isSubmitting state controls the button loading indicator
 * - Navigation happens automatically via the navigation guard
 * - This prevents race conditions and ensures smooth transitions
 */
export default function RegisterScreen() {
  const router = useRouter();
  const [apiError, setApiError] = useState<string>('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  // Watch username and password for real-time validation
  const username = watch('username');
  const password = watch('password');

  // Debounce username for availability check (300ms delay)
  const debouncedUsername = useDebounce(username, 300);

  // Check username availability when debounced value changes
  useEffect(() => {
    const checkUsernameAvailability = async () => {
      // Only check if username meets minimum requirements
      if (debouncedUsername && debouncedUsername.length >= 3) {
        setIsCheckingUsername(true);
        setUsernameError(null);

        const result = await AuthService.checkUsername(debouncedUsername);

        if (result.error) {
          // Network or server error - show the real error message
          setUsernameError(result.error);
          setUsernameAvailable(null);
        } else {
          setUsernameAvailable(result.available);
          setUsernameError(null);
        }

        setIsCheckingUsername(false);
      } else {
        setUsernameAvailable(null);
        setUsernameError(null);
      }
    };

    checkUsernameAvailability();
  }, [debouncedUsername]);

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setApiError('');

      // Final username availability check before submission
      if (!usernameAvailable) {
        setApiError('Username is not available. Please choose a different one.');
        return;
      }

      const { acceptTerms: _, ...registrationData } = data;
      await AuthService.register(registrationData);

      // Navigation to /(tabs) will happen automatically via the navigation guard
      // in _layout.tsx once isAuthenticated becomes true. No manual navigation needed.
    } catch (error: any) {
      // Handle 409 Conflict (email already registered) with a friendly alert
      if (error.status === 409 || error.code === 'AUTH_005') {
        Alert.alert(
          'Account Exists',
          'This email is already registered. Please sign in or use a different email.',
          [
            { text: 'Sign In', onPress: () => router.push('/login') },
            { text: 'Try Again', style: 'cancel' },
          ]
        );
        return;
      }

      // Handle other errors with inline form error
      setApiError(error.message || 'Registration failed. Please try again.');
    }
  };

  // Username availability indicator
  const getUsernameHelperText = () => {
    if (isCheckingUsername) {
      return 'Checking availability...';
    }
    if (usernameError) {
      return usernameError;
    }
    if (usernameAvailable === true) {
      return 'Username is available';
    }
    if (usernameAvailable === false) {
      return 'Username is already taken';
    }
    return '3-20 characters, letters, numbers, and underscores only';
  };

  const getUsernameHelperColor = () => {
    if (usernameError) return 'text-error';
    if (usernameAvailable === true) return 'text-success';
    if (usernameAvailable === false) return 'text-error';
    return 'text-text-secondary';
  };

  return (
    <SafeAreaView testID={TEST_IDS.auth.register.screen} className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 py-8">
            {/* Header */}
            <View className="mb-8">
              <Text className="text-4xl font-bold text-text-primary mb-2">
                Create Account
              </Text>
              <Text className="text-base text-text-secondary">
                Join PickRivals and start competing
              </Text>
            </View>

            {/* Form Error */}
            <FormError message={apiError} testID={TEST_IDS.auth.register.errorMessage} />

            {/* Registration Form */}
            <View className="space-y-4">
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    testID={TEST_IDS.auth.register.emailInput}
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
                name="username"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View>
                    <Input
                      testID={TEST_IDS.auth.register.usernameInput}
                      label="Username"
                      placeholder="Choose a username"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.username?.message}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      textContentType="username"
                    />
                    {!errors.username && (
                      <Text testID={TEST_IDS.auth.register.usernameStatus} className={`text-xs ${getUsernameHelperColor()} -mt-3 mb-3`}>
                        {getUsernameHelperText()}
                      </Text>
                    )}
                  </View>
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View>
                    <PasswordInput
                      testID={TEST_IDS.auth.register.passwordInput}
                      label="Password"
                      placeholder="Create a password"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.password?.message}
                      autoComplete="password-new"
                      textContentType="newPassword"
                    />
                    {/* Password requirements hint - always visible */}
                    {!errors.password && !password && (
                      <Text className="text-xs text-text-muted -mt-3 mb-1">
                        Min 8 chars with uppercase, lowercase, number, and special character (!@#$%)
                      </Text>
                    )}
                  </View>
                )}
              />

              {/* Password Strength Indicator */}
              <PasswordStrengthIndicator password={password} />

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <PasswordInput
                    testID={TEST_IDS.auth.register.confirmPasswordInput}
                    label="Confirm Password"
                    placeholder="Confirm your password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.confirmPassword?.message}
                    autoComplete="password-new"
                    textContentType="newPassword"
                  />
                )}
              />

              {/* Terms and Conditions */}
              <Controller
                control={control}
                name="acceptTerms"
                render={({ field: { onChange, value } }) => (
                  <View className="mt-4">
                    <TouchableOpacity
                      testID={TEST_IDS.auth.register.termsCheckbox}
                      onPress={() => onChange(!value)}
                      activeOpacity={0.7}
                      className="flex-row items-center"
                    >
                      <View
                        className={`
                          w-5 h-5 rounded border-2 mr-3 items-center justify-center
                          ${value ? 'bg-primary border-primary' : 'border-gray-600'}
                        `}
                      >
                        {value && (
                          <Text className="text-white text-xs font-bold">✓</Text>
                        )}
                      </View>
                      <Text className="text-sm text-text-secondary flex-1">
                        I agree to the{' '}
                        <Text className="text-primary font-medium">
                          Terms of Service
                        </Text>
                        {' '}and{' '}
                        <Text className="text-primary font-medium">
                          Privacy Policy
                        </Text>
                      </Text>
                    </TouchableOpacity>
                    {errors.acceptTerms && (
                      <Text className="text-xs text-error mt-1">
                        {errors.acceptTerms.message}
                      </Text>
                    )}
                  </View>
                )}
              />

              {/* Register Button */}
              <Button
                testID={TEST_IDS.auth.register.submitButton}
                onPress={handleSubmit(onSubmit)}
                isLoading={isSubmitting}
                fullWidth
                className="mt-6"
              >
                Create Account
              </Button>
            </View>

            {/* Sign In Link */}
            <View className="flex-row justify-center items-center mt-8">
              <Text className="text-text-secondary text-sm">
                Already have an account?{' '}
              </Text>
              <Link href={"/login" as any} asChild replace>
                <TouchableOpacity testID={TEST_IDS.auth.register.loginLink} activeOpacity={0.7}>
                  <Text className="text-primary text-sm font-semibold">
                    Sign In
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
