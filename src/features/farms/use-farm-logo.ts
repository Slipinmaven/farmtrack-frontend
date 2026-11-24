import { useEffect, useState } from "react";

import { fetchFarmLogoDataUri } from "@/features/farms/logo";

type FarmLogoState = {
  logoPath: string | null | undefined;
  uri: string | null;
  error: boolean;
};

export function useFarmLogo(
  logoPath: string | null | undefined,
): { uri: string | null; error: boolean } {
  const [state, setState] = useState<FarmLogoState>({
    logoPath,
    uri: null,
    error: false,
  });

  useEffect(() => {
    let active = true;
    if (!logoPath) {
      return () => {
        active = false;
      };
    }

    fetchFarmLogoDataUri(logoPath).then(
      (uri) => {
        if (active) setState({ logoPath, uri, error: false });
      },
      () => {
        if (active) setState({ logoPath, uri: null, error: true });
      },
    );

    return () => {
      active = false;
    };
  }, [logoPath]);

  if (state.logoPath !== logoPath) return { uri: null, error: false };
  return { uri: state.uri, error: state.error };
}
