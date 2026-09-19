import { contextBridge, ipcRenderer } from "electron";

export type Profile = {
	id: string;
	name: string;
	avatarColor: string;
	avatarEmoji: string;
};

export type FonteDeCaptura = {
	id: string;
	name: string;
	thumbnail: string;
	type: "screen" | "window";
};

contextBridge.exposeInMainWorld("api", {
	getProfile: (): Promise<Profile | null> => ipcRenderer.invoke("profile:get"),
	saveProfile: (profile: Profile): Promise<Profile> =>
		ipcRenderer.invoke("profile:save", profile),
	onSolicitarEscolhaDeTela: (callback: (fontes: FonteDeCaptura[]) => void) => {
		ipcRenderer.on("captura:solicitar-escolha", (_e, fontes) =>
			callback(fontes),
		);
	},
	responderEscolhaDeTela: (sourceId: string | null, incluirAudio: boolean) =>
		ipcRenderer.send("captura:escolha-respondida", { sourceId, incluirAudio }),
});
