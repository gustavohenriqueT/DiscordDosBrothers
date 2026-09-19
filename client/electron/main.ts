import path from "node:path";
import {
	app,
	BrowserWindow,
	desktopCapturer,
	ipcMain,
	session,
} from "electron";
import Store from "electron-store";

app.commandLine.appendSwitch(
	"disable-features",
	"AllowWgcScreenCapturer,AllowWgcWindowCapturer",
);

// Formato do perfil salvo localmente no disco do usuário (sem servidor, sem login)
type Profile = {
	id: string;
	name: string;
	avatarColor: string;
	avatarEmoji: string;
};

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
	} else {
		win.loadFile(path.join(__dirname, "../dist/index.html"));
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
	session.defaultSession.setDisplayMediaRequestHandler(
		async (_request, callback) => {
			const sources = await desktopCapturer.getSources({
				types: ["screen", "window"],
				thumbnailSize: { width: 320, height: 180 },
			});

			const fontes = sources.map((s) => ({
				id: s.id,
				name: s.name,
				thumbnail: s.thumbnail.toDataURL(),
				type: s.id.startsWith("screen") ? "screen" : "window",
			}));

			const janelaAtiva = BrowserWindow.getAllWindows()[0];

			const escolha = await new Promise<{
				sourceId: string | null;
				incluirAudio: boolean;
			}>((resolve) => {
				ipcMain.once("captura:escolha-respondida", (_event, resposta) =>
					resolve(resposta),
				);
				janelaAtiva?.webContents.send("captura:solicitar-escolha", fontes);
			});

			if (!escolha.sourceId) {
				callback({}); // usuário cancelou a seleção
				return;
			}

			const fonteEscolhida = sources.find((s) => s.id === escolha.sourceId);
			if (!fonteEscolhida) {
				callback({});
				return;
			}

			callback(
				escolha.incluirAudio
					? { video: fonteEscolhida, audio: "loopback" }
					: { video: fonteEscolhida },
			);
		},
	);

	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
