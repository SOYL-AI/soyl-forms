import type { ComponentType, SVGProps } from "react";
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Clock,
  Flag,
  Grid3x3,
  Hash,
  Link,
  Mail,
  MessageSquare,
  PartyPopper,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  ToggleLeft,
  Type,
  Upload,
} from "lucide-react";
import type { BlockType } from "@/types/forms";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

/** One icon per block type, shared by the outline, picker, and analytics. */
export const BLOCK_ICONS: Record<BlockType, Icon> = {
  welcome: Flag,
  statement: MessageSquare,
  thank_you: PartyPopper,
  short_text: Type,
  long_text: AlignLeft,
  email: Mail,
  phone: Phone,
  url: Link,
  number: Hash,
  single_choice: CircleDot,
  multiple_choice: CheckSquare,
  dropdown: ChevronDown,
  yes_no: ToggleLeft,
  legal: ShieldCheck,
  rating: Star,
  opinion_scale: SlidersHorizontal,
  matrix: Grid3x3,
  date: Calendar,
  time: Clock,
  file_upload: Upload,
};
