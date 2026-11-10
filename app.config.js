const { expo } = require("./app.json");

module.exports = () => {
  return {
    ...expo,
    plugins: [...(expo.plugins ?? []), "expo-sharing"],
    android: {
      ...expo.android,
      permissions: [
        ...(expo.android?.permissions ?? []),
        "REQUEST_INSTALL_PACKAGES",
      ],
      googleServicesFile: "./google-services.json",
    },
  };
};
