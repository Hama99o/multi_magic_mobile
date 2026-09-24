// EXPECTED TO FAIL LINT — see README.md.
// The index of lucide-react-native ships every icon into the bundle.
import { X } from "lucide-react-native";

export function Bad() {
  return <X size={16} />;
}
