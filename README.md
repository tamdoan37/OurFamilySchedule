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
Behind a reverse proxy, start the relay with `TRUST_PROXY=1` so the new-room limit uses the last `X-Forwarded-For` address for both HTTP and socket connections. Leave it unset otherwise. Clients can put a fake address first, so the relay trusts the last hop only.

Wake-up pushes are silent (`data.kind` is `sync`, with no title, body, or sound). iOS delivers background pushes on a best-effort basis, so opening the app still catches up and reschedules reminders.

## Demo Flow
1. Open the app → tap **Load Demo Events**.
2. Tap **View Timeline** to see caregiver lanes and an unassigned event.
3. Tap **Scan Schedule Flyer** to photograph a schedule. The phone reads the text and drafts events on the device. Check low-confidence rows, then save.

## What's Included
- Phase 1: Camera + on-device flyer parser + OS Calendar save
- Phase 2: Yjs CRDT + Zustand
- Phase 3: AES-256-GCM crypto utils + dumb relay
- Phase 4: Anti-grid vertical timeline
- Phase 5: Conflict stubs

The flyer parser stays on the phone. iOS 26 uses Vision, then Apple Foundation Models on an Apple Intelligence device. Android uses ML Kit Text Recognition, then Gemini Nano where that model is already available. Older phones use the recognized text plus a date parser and mark those drafts low confidence. Put real schedule photos in `parser-tests/photos/`. A same-named `.txt` file is the recognized text for `npm run parse-samples`, which prints how many events each file produced. The script does not upload anything.
