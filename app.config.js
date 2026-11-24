module.exports = ({ config }) => {
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      "expo-sharing",
      "./plugins/withAndroidShareIntent",
    ],
    updates: {
      url: "https://u.expo.dev/a53c2a57-17df-42fd-a93f-7f4b21ba0337",
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    android: {
      ...config.android,
      permissions: [
        ...(config.android?.permissions ?? []),
        "REQUEST_INSTALL_PACKAGES",
      ],
      googleServicesFile: "./google-services.json",
    },
  };
};
