type UpdateHandler = (update: Uint8Array) => void;
type ClaimHandler = (eventId: string) => void;

let updateHandler: UpdateHandler | null = null;
let claimHandler: ClaimHandler | null = null;

export function setLocalUpdateHandler(handler: UpdateHandler) {
  updateHandler = handler;
}

export function setLocalClaimHandler(handler: ClaimHandler) {
  claimHandler = handler;
}

export function emitLocalUpdate(update: Uint8Array) {
  updateHandler?.(update);
}

export function emitLocalClaim(eventId: string) {
  claimHandler?.(eventId);
}
