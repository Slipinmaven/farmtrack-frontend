const { expo } = require("./app.json");

module.exports = () => {
  return {
    ...expo,
    plugins: [...(expo.plugins ?? []), "expo-sharing"],
    android: {
      ...expo.android,
      googleServicesFile: "./google-services.json",
    },
  };
};
