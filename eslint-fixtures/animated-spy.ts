// EXPECTED TO FAIL LINT — see README.md.
// A spy on Animated.timing passes for a component that builds its animation
// and never starts it. docs/TESTING.md §19.
import { Animated } from "react-native";

export const timing = jest.spyOn(Animated, "timing");
