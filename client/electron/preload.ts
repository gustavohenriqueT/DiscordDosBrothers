import { contextBridge, ipcRenderer } from "electron";

export type Profile = {
	id: string;
	name: string;
	avatarColor: string;
	avatarEmoji: string;
};

contextBridge.exposeInMainWorld("api", {
	getProfile: (): Promise<Profile | null> => ipcRenderer.invoke("profile:get"),
	saveProfile: (profile: Profile): Promise<Profile> =>
		ipcRenderer.invoke("profile:save", profile),
});
