/** Per-icon modules of lucide-react-native, which ships types only for its
 *  index. Each file default-exports one icon component. See
 *  `src/components/icons.ts`. */
declare module "lucide-react-native/dist/esm/icons/*" {
  import type { LucideIcon } from "lucide-react-native";
  const Icon: LucideIcon;
  export default Icon;
}
