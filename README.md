# OurFamilySchedule — Device Demo

Local-first family logistics engine. Disrupts Cozi with on-device AI parsing and zero-knowledge E2EE CRDT sync.

## Run the Demo on Your Device

### Option 1: Quick Preview (Expo Go — limited)
Vision Camera and crypto modules require a custom dev client. For a fast look at the timeline and navigation:

```bash
git clone https://github.com/tamdoan37/OurFamilySchedule.git
cd OurFamilySchedule
npm install
npx expo start
```

Scan the QR code with the Expo Go app (iOS/Android). Use **Load Demo Events** then **View Timeline**.

### Option 2: Full Demo (Recommended — Custom Dev Client)
Required for camera + native modules.

```bash
git clone https://github.com/tamdoan37/OurFamilySchedule.git
cd OurFamilySchedule
npm install
npx expo prebuild --clean
npx expo run:ios     # or npx expo run:android
```

This builds and installs the app on a connected device or simulator.

### Relay Server (optional, for Phase 3 testing)
```bash
cd relay
npm install
npm start
```

Production must use https://. A local http:// relay is only for a private test.
Behind a reverse proxy, start the relay with `TRUST_PROXY=1` so the new-room limit uses the first `X-Forwarded-For` address for both HTTP and socket connections. Leave it unset otherwise.

## Demo Flow
1. Open the app → tap **Load Demo Events**.
2. Tap **View Timeline** to see caregiver lanes and an unassigned event.
3. Tap **Scan Schedule Flyer** to try the camera + mock AI parser → review drafts → save to OS Calendar.

## What's Included
- Phase 1: Camera + mock AI tabular parser + OS Calendar save
- Phase 2: Yjs CRDT + Zustand
- Phase 3: AES-256-GCM crypto utils + dumb relay
- Phase 4: Anti-grid vertical timeline
- Phase 5: Conflict stubs

Native AI bridge (Apple Foundation Models / Gemini Nano) is mocked with realistic JSON output. Replace `parseScheduleFromImage` in `src/screens/CaptureScreen.tsx` when ready.
