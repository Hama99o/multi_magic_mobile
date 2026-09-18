// `jsxImportSource: "nativewind"` is what lets `className` work on every
// component. Without it NativeWind's JSX transform never runs and every utility
// class is silently dropped — the failure is invisible rather than loud.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
