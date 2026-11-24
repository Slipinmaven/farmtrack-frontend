const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withAndroidShareIntent(config) {
  return withAndroidManifest(config, (config) => {
    const activity = config.modResults.manifest.application?.[0]?.activity?.find(
      (candidate) => candidate.$["android:name"]?.endsWith(".MainActivity"),
    );
    if (!activity) {
      throw new Error("Unable to find FarmTrack's MainActivity for share intents.");
    }

    const shareFilter = activity["intent-filter"]?.find((filter) =>
      filter.action?.some(
        (action) => action.$["android:name"] === "android.intent.action.SEND",
      ),
    );
    if (!shareFilter) {
      activity["intent-filter"] = [
        ...(activity["intent-filter"] ?? []),
        {
          action: [{ $: { "android:name": "android.intent.action.SEND" } }],
          category: [
            { $: { "android:name": "android.intent.category.DEFAULT" } },
          ],
          data: [
            { $: { "android:mimeType": "text/plain" } },
            { $: { "android:mimeType": "text/*" } },
          ],
        },
      ];
    } else {
      shareFilter.category ??= [];
      if (
        !shareFilter.category.some(
          (category) =>
            category.$["android:name"] === "android.intent.category.DEFAULT",
        )
      ) {
        shareFilter.category.push({
          $: { "android:name": "android.intent.category.DEFAULT" },
        });
      }

      shareFilter.data ??= [];
      const configuredTypes = new Set(
        shareFilter.data.map((data) => data.$["android:mimeType"]),
      );
      for (const mimeType of ["text/plain", "text/*"]) {
        if (!configuredTypes.has(mimeType)) {
          shareFilter.data.push({ $: { "android:mimeType": mimeType } });
        }
      }
    }
    return config;
  });
};
