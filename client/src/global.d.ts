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

declare global {
	interface Window {
		api: {
			getProfile: () => Promise<Profile | null>;
			saveProfile: (profile: Profile) => Promise<Profile>;
			onSolicitarEscolhaDeTela: (
				callback: (fontes: FonteDeCaptura[]) => void,
			) => void;
			responderEscolhaDeTela: (
				sourceId: string | null,
				incluirAudio: boolean,
			) => void;
		};
	}
}
