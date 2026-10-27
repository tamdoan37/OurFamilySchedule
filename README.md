# OurFamilySchedule

Local-first family logistics engine. Disrupts Cozi with:

1. On-device AI tabular parsing (camera → structured events)
2. Zero-knowledge E2EE CRDT sync via dumb relay

## Phases Implemented

- Phase 1: Camera + AI parse → OS Calendar (MVP core)
- Phase 2: Yjs CRDT + Zustand + persistence
- Phase 3: E2EE key exchange + encrypted deltas + Node relay
- Phase 4: Vertical anti-grid timeline
- Phase 5: Conflict diff modal + Kid Mode

## Quick Start

```bash
npm install
npx expo prebuild --clean
npx expo run:ios   # or android
```

Requires custom dev client for Vision Camera and crypto modules.

See `src/` for implementation. Relay server in `relay/`.
