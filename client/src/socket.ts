import { io } from "socket.io-client";

// Por enquanto aponta pro servidor local. Quando formos pra Oracle Cloud,
// isso vira a URL pública da VM.
export const socket = io("http://localhost:4000", {
	autoConnect: false,
});
