import { useEffect, useState } from "react";
import type { Profile } from "./global";
import Lobby from "./screens/Lobby";
import ProfileSetup from "./screens/ProfileSetup";
import Room from "./screens/Room";
import { socket } from "./socket";

type Participante = {
	id: string;
	name: string;
	avatarColor: string;
	avatarEmoji: string;
	socketId: string;
};
type Canal = { id: string; name: string };
type SalaAtual = {
	code: string;
	participants: Participante[];
	channels: Canal[];
} | null;

export default function App() {
	const [profile, setProfile] = useState<Profile | null | "loading">("loading");
	const [sala, setSala] = useState<SalaAtual>(null);

	useEffect(() => {
		window.api.getProfile().then(setProfile);
	}, []);

	if (profile === "loading") {
		return <div className="loading-screen">Carregando…</div>;
	}

	if (!profile) {
		return <ProfileSetup onDone={setProfile} />;
	}

	if (!sala) {
		return <Lobby profile={profile} onEntrou={setSala} />;
	}

	function sairDaSala() {
		// Desconectar e reconectar o socket faz o servidor limpar sua presença
		// na sala automaticamente (evento "disconnect" do lado do servidor).
		socket.disconnect();
		socket.connect();
		setSala(null);
	}

	return (
		<Room
			code={sala.code}
			participantesIniciais={sala.participants}
			canaisIniciais={sala.channels}
			profile={profile}
			onSairDaSala={sairDaSala}
		/>
	);
}
