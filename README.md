# FarmTrack Mobile

FarmTrack Mobile is the Expo / React Native client for poultry farm operations. It connects to the separately maintained FarmTrack FastAPI backend.

## What it does

- Tracks farms, poultry batches, blocks and movements.
- Records egg collections, egg sales, chicken sales and losses.
- Manages products, purchases, inventory, expenses, customers and suppliers.
- Shows activity, reminders, sales summaries and profitability reports.
- Supports Android, iOS and web through Expo.

## Requirements

- Node.js 22 or newer and npm. The pricing test uses Node's built-in TypeScript stripping.
- A running FarmTrack API for sign-in and farm data.
- For native Android builds: Android Studio and its Android SDK.
- For native iOS builds: macOS with Xcode.

## Run locally

Install dependencies and create a local environment file:

```sh
npm ci
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
npm ci
Copy-Item .env.example .env
```

Set `EXPO_PUBLIC_API_URL` in `.env` to the backend origin. Do not include `/api/v1`; the client adds that path automatically.

| Where the app runs | Example API origin |
| --- | --- |
| Web or iOS simulator on the same computer | `http://localhost:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| Physical device | `http://<development-computer-LAN-IP>:8000` |

The backend must allow the app origin through its CORS settings when using web. `EXPO_PUBLIC_*` values are bundled into the client and are **not secrets**.

Start the Expo development server:

```sh
npm start
```

Use the Expo CLI prompts to open the app on a connected emulator/device or in a browser. Native features such as secure storage, local authentication and push notifications may require a development build; see the Expo documentation and the project's `eas.json` profiles.

## Android APK updates

On startup, signed-in Android users are offered any active release whose
version code is newer than the installed build. Accepting downloads the APK
through the authenticated FarmTrack API and opens Android's package installer.
Users can defer the prompt and continue using the app. Android requires the
user to approve each installation and may ask them to allow installs from
FarmTrack in Android settings. The APK must use the same application ID and
signing key and have a higher version code. Adding or changing this installer
flow requires a new APK before it can update existing installations.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm run test:pricing
```

To create a static web export:

```sh
npx expo export --platform web
```

The export is written to `dist/` and is ignored by Git.

## Project structure

- `src/app/` — Expo Router routes and navigation.
- `src/features/` — feature API clients, query hooks, types and domain logic.
- `src/components/` — shared UI and layout components.
- `src/providers/` — authentication, selected farm and theme state.
- `src/lib/` — API client, storage, configuration and query utilities.
- `assets/` — bundled fonts, app assets and editable brand artwork in `assets/branding/`.
- `tests/` — focused Node.js tests.

Authentication tokens are stored using Expo SecureStore on native platforms. TanStack Query is used for server state and Axios for API requests.

The FarmTrack mark is rendered as a native vector component on the sign-in, app-lock and farm-header surfaces. The source SVG variations, supplied PNG and local comparison page are in `assets/branding/`. Expo uses the generated 1024 × 1024 images in `assets/images/` for platform icons and the splash screen.

## Backend

The backend is a separate repository/service. Set `EXPO_PUBLIC_API_URL` to the deployed API origin for each build environment. The API is versioned under `/api/v1`.

## Security and configuration

- Never commit `.env`, signing keys, Firebase service configuration, access tokens or other credentials.
- Do not put private keys or server secrets in `EXPO_PUBLIC_*` variables; client-side values are public.
- Keep `.env.example` updated when adding required client configuration.

## License

FarmTrack does not currently specify a project license. You can push the repository without selecting one. If published without a license, the default copyright applies and no additional permissions to reuse, modify or distribute FarmTrack are granted.
