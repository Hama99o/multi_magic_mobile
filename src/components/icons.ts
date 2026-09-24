/**
 * EVERY ICON THE APP DRAWS, EACH IMPORTED FROM ITS OWN FILE.
 *
 * Measured 2026-09-24: `import { X } from "lucide-react-native"` pulled the
 * WHOLE library into the bundle — 1,556 icons, 3.36 MB of a 13.6 MB dev
 * bundle, for the 41 this app uses. Metro does not drop unused exports, so
 * every screen that imported one icon from the index shipped all of them,
 * and Expo Go downloads that on every cold open (the owner's "not wait for
 * the logo").
 *
 * So icons come from HERE, and this file names each one's own module. A new
 * icon is one line below; `.eslintrc.js` refuses the index import so a
 * single stray line cannot put the other 1,500 back.
 */
import type { LucideIcon } from "lucide-react-native";

import ArrowUpIcon from "lucide-react-native/dist/esm/icons/arrow-up";
import BellIcon from "lucide-react-native/dist/esm/icons/bell";
import CalendarDaysIcon from "lucide-react-native/dist/esm/icons/calendar-days";
import CameraIcon from "lucide-react-native/dist/esm/icons/camera";
import CheckIcon from "lucide-react-native/dist/esm/icons/check";
import CheckCheckIcon from "lucide-react-native/dist/esm/icons/check-check";
import ChevronDownIcon from "lucide-react-native/dist/esm/icons/chevron-down";
import ChevronLeftIcon from "lucide-react-native/dist/esm/icons/chevron-left";
import ChevronRightIcon from "lucide-react-native/dist/esm/icons/chevron-right";
import CopyIcon from "lucide-react-native/dist/esm/icons/copy";
import ExternalLinkIcon from "lucide-react-native/dist/esm/icons/external-link";
import EyeIcon from "lucide-react-native/dist/esm/icons/eye";
import EyeOffIcon from "lucide-react-native/dist/esm/icons/eye-off";
import FileTextIcon from "lucide-react-native/dist/esm/icons/file-text";
import FilterIcon from "lucide-react-native/dist/esm/icons/filter";
import ImageIcon from "lucide-react-native/dist/esm/icons/image";
import ImagesIcon from "lucide-react-native/dist/esm/icons/images";
import KeyRoundIcon from "lucide-react-native/dist/esm/icons/key-round";
import MapPinIcon from "lucide-react-native/dist/esm/icons/map-pin";
import MessageSquareTextIcon from "lucide-react-native/dist/esm/icons/message-square-text";
import MicIcon from "lucide-react-native/dist/esm/icons/mic";
import MoreVerticalIcon from "lucide-react-native/dist/esm/icons/ellipsis-vertical";
import NotebookPenIcon from "lucide-react-native/dist/esm/icons/notebook-pen";
import PauseIcon from "lucide-react-native/dist/esm/icons/pause";
import PencilIcon from "lucide-react-native/dist/esm/icons/pencil";
import PlayIcon from "lucide-react-native/dist/esm/icons/play";
import PlusIcon from "lucide-react-native/dist/esm/icons/plus";
import RefreshCwIcon from "lucide-react-native/dist/esm/icons/refresh-cw";
import RepeatIcon from "lucide-react-native/dist/esm/icons/repeat";
import RotateCcwIcon from "lucide-react-native/dist/esm/icons/rotate-ccw";
import RotateCwIcon from "lucide-react-native/dist/esm/icons/rotate-cw";
import ShieldCheckIcon from "lucide-react-native/dist/esm/icons/shield-check";
import SquareIcon from "lucide-react-native/dist/esm/icons/square";
import ThumbsDownIcon from "lucide-react-native/dist/esm/icons/thumbs-down";
import ThumbsUpIcon from "lucide-react-native/dist/esm/icons/thumbs-up";
import Trash2Icon from "lucide-react-native/dist/esm/icons/trash-2";
import TriangleAlertIcon from "lucide-react-native/dist/esm/icons/triangle-alert";
import Undo2Icon from "lucide-react-native/dist/esm/icons/undo-2";
import UsersIcon from "lucide-react-native/dist/esm/icons/users";
import Volume2Icon from "lucide-react-native/dist/esm/icons/volume-2";
import XIcon from "lucide-react-native/dist/esm/icons/x";

export type { LucideIcon };
export const ArrowUp: LucideIcon = ArrowUpIcon;
export const Bell: LucideIcon = BellIcon;
export const CalendarDays: LucideIcon = CalendarDaysIcon;
export const Camera: LucideIcon = CameraIcon;
export const Check: LucideIcon = CheckIcon;
export const CheckCheck: LucideIcon = CheckCheckIcon;
export const ChevronDown: LucideIcon = ChevronDownIcon;
export const ChevronLeft: LucideIcon = ChevronLeftIcon;
export const ChevronRight: LucideIcon = ChevronRightIcon;
export const Copy: LucideIcon = CopyIcon;
export const ExternalLink: LucideIcon = ExternalLinkIcon;
export const Eye: LucideIcon = EyeIcon;
export const EyeOff: LucideIcon = EyeOffIcon;
export const FileText: LucideIcon = FileTextIcon;
export const Filter: LucideIcon = FilterIcon;
export const Image: LucideIcon = ImageIcon;
export const Images: LucideIcon = ImagesIcon;
export const KeyRound: LucideIcon = KeyRoundIcon;
export const MapPin: LucideIcon = MapPinIcon;
export const MessageSquareText: LucideIcon = MessageSquareTextIcon;
export const Mic: LucideIcon = MicIcon;
export const MoreVertical: LucideIcon = MoreVerticalIcon;
export const NotebookPen: LucideIcon = NotebookPenIcon;
export const Pause: LucideIcon = PauseIcon;
export const Pencil: LucideIcon = PencilIcon;
export const Play: LucideIcon = PlayIcon;
export const Plus: LucideIcon = PlusIcon;
export const RefreshCw: LucideIcon = RefreshCwIcon;
export const Repeat: LucideIcon = RepeatIcon;
export const RotateCcw: LucideIcon = RotateCcwIcon;
export const RotateCw: LucideIcon = RotateCwIcon;
export const ShieldCheck: LucideIcon = ShieldCheckIcon;
export const Square: LucideIcon = SquareIcon;
export const ThumbsDown: LucideIcon = ThumbsDownIcon;
export const ThumbsUp: LucideIcon = ThumbsUpIcon;
export const Trash2: LucideIcon = Trash2Icon;
export const TriangleAlert: LucideIcon = TriangleAlertIcon;
export const Undo2: LucideIcon = Undo2Icon;
export const Users: LucideIcon = UsersIcon;
export const Volume2: LucideIcon = Volume2Icon;
export const X: LucideIcon = XIcon;
