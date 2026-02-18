// =====================================================
// AppIcon Component
// =====================================================
// Centralized Phosphor icon wrapper with luxury theme defaults.
// Provides a type-safe icon name registry for config-driven usage.
// Uses phosphor-react-native v3 *Icon naming convention.

import React from 'react';
import type { ViewStyle } from 'react-native';
import {
  PencilSimpleIcon,
  FireIcon,
  TrophyIcon,
  UserCircleIcon,
  WalletIcon,
  CreditCardIcon,
  BankIcon,
  CrosshairIcon,
  ArrowULeftDownIcon,
  ChartBarIcon,
  GiftIcon,
  CalendarCheckIcon,
  GearSixIcon,
  ShieldIcon,
  ShieldStarIcon,
  MedalIcon,
  DiamondIcon,
  CrownIcon,
  LockIcon,
  HourglassIcon,
  CheckCircleIcon,
  XCircleIcon,
  XIcon,
  CheckIcon,
  SmileyMehIcon,
  HandshakeIcon,
  ConfettiIcon,
  NotePencilIcon,
  WifiSlashIcon,
  WarningIcon,
  ReceiptIcon,
  BellIcon,
  QuestionIcon,
  SignOutIcon,
  CaretRightIcon,
  GlobeIcon,
  LightbulbIcon,
  UsersThreeIcon,
  EnvelopeSimpleIcon,
  GameControllerIcon,
  EqualsIcon,
  ProhibitIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
} from 'phosphor-react-native';
import type { IconWeight } from 'phosphor-react-native';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Icon Registry
// =====================================================

export const ICON_MAP = {
  PencilSimple: PencilSimpleIcon,
  Fire: FireIcon,
  Trophy: TrophyIcon,
  UserCircle: UserCircleIcon,
  Wallet: WalletIcon,
  CreditCard: CreditCardIcon,
  Bank: BankIcon,
  Crosshair: CrosshairIcon,
  ArrowULeftDown: ArrowULeftDownIcon,
  ChartBar: ChartBarIcon,
  Gift: GiftIcon,
  CalendarCheck: CalendarCheckIcon,
  GearSix: GearSixIcon,
  Shield: ShieldIcon,
  ShieldStar: ShieldStarIcon,
  Medal: MedalIcon,
  Diamond: DiamondIcon,
  Crown: CrownIcon,
  Lock: LockIcon,
  Hourglass: HourglassIcon,
  CheckCircle: CheckCircleIcon,
  XCircle: XCircleIcon,
  X: XIcon,
  Check: CheckIcon,
  SmileyMeh: SmileyMehIcon,
  Handshake: HandshakeIcon,
  Confetti: ConfettiIcon,
  NotePencil: NotePencilIcon,
  WifiSlash: WifiSlashIcon,
  Warning: WarningIcon,
  Receipt: ReceiptIcon,
  Bell: BellIcon,
  Question: QuestionIcon,
  SignOut: SignOutIcon,
  CaretRight: CaretRightIcon,
  Globe: GlobeIcon,
  Lightbulb: LightbulbIcon,
  UsersThree: UsersThreeIcon,
  EnvelopeSimple: EnvelopeSimpleIcon,
  GameController: GameControllerIcon,
  Equals: EqualsIcon,
  Prohibit: ProhibitIcon,
  MagnifyingGlass: MagnifyingGlassIcon,
  Calendar: CalendarIcon,
} as const;

export type IconName = keyof typeof ICON_MAP;

// =====================================================
// Props
// =====================================================

export interface AppIconProps {
  name: IconName;
  size?: number;
  color?: string;
  weight?: IconWeight;
  style?: ViewStyle;
}

// =====================================================
// Component
// =====================================================

export function AppIcon({
  name,
  size = 24,
  color = LUXURY_THEME.gold.main,
  weight = 'duotone',
}: AppIconProps) {
  const IconComponent = ICON_MAP[name];
  return <IconComponent size={size} color={color} weight={weight} />;
}

export default AppIcon;
