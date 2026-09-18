import path from "node:path";
import {
	app,
	BrowserWindow,
	desktopCapturer,
	ipcMain,
	session,
} from "electron";
import Store from "electron-store";

// Formato do perfil salvo localmente no disco do usuário (sem servidor, sem login)
type Profile = {
	id: string;
	name: string;
	avatarColor: string;
	avatarEmoji: string;
};

// Permite rodar múltiplas instâncias do app com perfis diferentes,
// usando: $env:PERFIL="pessoa1" antes de npm run electron:dev.
const sufixoPerfil = process.env.PERFIL;
if (sufixoPerfil) {
	app.setPath(
		"userData",
		path.join(app.getPath("userData"), `perfil-${sufixoPerfil}`),
	);
}

const store = new Store<{ profile: Profile | null }>({
	defaults: { profile: null },
});

function createWindow() {
	const win = new BrowserWindow({
		width: 1100,
		height: 720,
		minWidth: 800,
		minHeight: 560,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	const devServerUrl = process.env.VITE_DEV_SERVER_URL;
	if (devServerUrl) {
		win.loadURL(devServerUrl);
		win.webContents.openDevTools({ mode: "detach" });
	} else {
		win.loadFile(path.join(__dirname, "../dist/index.html"));
		win.webContents.openDevTools({ mode: "detach" });
	}
}
// --- IPC: ponte entre a interface (React) e o armazenamento local ---
ipcMain.handle("profile:get", () => {
	return store.get("profile");
});

ipcMain.handle("profile:save", (_event, profile: Profile) => {
	store.set("profile", profile);
	return profile;
});

app.whenReady().then(() => {
	// Necessário para o getDisplayMedia() funcionar no Electron ---
	(session.defaultSession.setDisplayMediaRequestHandler as any)(
		async (_request: any, callback: any) => {
			const sources = await desktopCapturer.getSources({
				types: ["screen", "window"],
			});
			callback({ video: sources[0], audio: "loopback" });
		},
		{ useSystemPicker: true },
	);

	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
