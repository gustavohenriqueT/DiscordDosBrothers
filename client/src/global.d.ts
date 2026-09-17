export type Profile = {
	id: string;
	name: string;
	avatarColor: string;
	avatarEmoji: string;
};

declare global {
	interface Window {
		api: {
			getProfile: () => Promise<Profile | null>;
			saveProfile: (profile: Profile) => Promise<Profile>;
		};
	}
}
