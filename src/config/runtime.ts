/**
 * WHICH KIND OF BINARY THIS JS IS RUNNING IN.
 *
 * Expo Go (`storeClient`) is the App Store app that runs any project of its
 * SDK; it carries Expo's own native modules and nobody else's. So inside it,
 * `expo-share-intent` does not exist (importing it throws at launch), and an
 * iOS background URLSession is not ours to start. Everything else Pages uses
 * — expo-file-system, expo-sharing, expo-video, react-native-webview — ships
 * inside Expo Go and behaves the same.
 *
 * A development build and a release build are NOT `storeClient`, so nothing
 * changes for them.
 */
import Constants, { ExecutionEnvironment } from "expo-constants";

export const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
