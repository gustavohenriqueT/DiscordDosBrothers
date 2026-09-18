import { io } from "socket.io-client";

export const socket = io("http://147.15.80.193:4000", {
	autoConnect: false,
});
