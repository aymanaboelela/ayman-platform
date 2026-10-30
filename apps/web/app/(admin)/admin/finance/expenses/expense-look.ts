import {
  Car,
  Clapperboard,
  CreditCard,
  HeartHandshake,
  Megaphone,
  Printer,
  Shapes,
  Trophy,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ExpenseCategory } from '@ayman/contracts/admin/expenses';

/**
 * How each category LOOKS — an icon and one of the six chart hues.
 *
 * Eleven categories over six hues means some share a colour, so the icon is
 * what tells two of them apart, never the hue alone. Pairs that share a hue
 * were picked to be ones that rarely sit next to each other in a month
 * (printing/prizes, shipping/services). `other` is grey on purpose: it is the
 * bucket that should look like it needs sorting.
 */
export const EXPENSE_LOOK: Record<ExpenseCategory, { icon: LucideIcon; hue: string }> = {
  filming: { icon: Clapperboard, hue: '3' },
  printing: { icon: Printer, hue: '1' },
  shipping: { icon: Truck, hue: '5' },
  equipment: { icon: Wrench, hue: '2' },
  marketing: { icon: Megaphone, hue: '4' },
  staff: { icon: Users, hue: '6' },
  services: { icon: CreditCard, hue: '5' },
  transport: { icon: Car, hue: '2' },
  prizes: { icon: Trophy, hue: '1' },
  charity: { icon: HeartHandshake, hue: '6' },
  other: { icon: Shapes, hue: 'muted' },
};
