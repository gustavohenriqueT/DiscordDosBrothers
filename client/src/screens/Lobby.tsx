import { useState } from "react";
import type { Profile } from "../global";
import { socket } from "../socket";

type Participante = {
	id: string;
	name: string;
	avatarColor: string;
	avatarEmoji: string;
};

export default function Lobby({
	profile,
	channels,
  	onEntrou,
}: {
  	profile: Profile;
  	onEntrou: (sala: { code: string; participants: Participante[] }) => void;
}) {
	const [codigoDigitado, setCodigoDigitado] = useState("");
	const [carregando, setCarregando] = useState(false);
	const [erro, setErro] = useState<string | null>(null);

	function garantirConexao() {
		if (!socket.connected) socket.connect();
	}

	function criarSala() {
		setErro(null);
		setCarregando(true);
		garantirConexao();
		socket.emit("room:create", profile, (resposta: any) => {
			setCarregando(false);
			if (resposta.ok) {
				onEntrou({ code: resposta.code, participants: resposta.participants, channels: resposta.channels });
			} else {
				setErro("Não foi possível criar a sala.");
			}
		});
	}

	function entrarNaSala() {
		if (codigoDigitado.trim().length < 4) return;
		setErro(null);
		setCarregando(true);
		garantirConexao();
		socket.emit(
			"room:join",
			{ code: codigoDigitado.trim(), perfil: profile },
			(resposta: any) => {
				setCarregando(false);
				if (resposta.ok) {
					onEntrou({
						code: resposta.code,
						participants: resposta.participants,
						channels: resposta.channels
					});
				} else {
					setErro(resposta.error ?? "Sala não encontrada.");
				}
			},
		);
	}

	return (
		<div className="lobby">
			<div className="lobby__card">
				<h1>Criar ou entrar numa sala</h1>

				<button
					className="primary-button"
					onClick={criarSala}
					disabled={carregando}
				>
					{carregando ? "Um instante…" : "Criar sala nova"}
				</button>

				<div className="lobby__divider">ou</div>

				<label className="field">
					<span>Código da sala</span>
					<input
						value={codigoDigitado}
						onChange={(e) => setCodigoDigitado(e.target.value.toUpperCase())}
						placeholder="Ex: AB3XZ9"
						maxLength={6}
						onKeyDown={(e) => e.key === "Enter" && entrarNaSala()}
					/>
				</label>
				<button
					className="secondary-button"
					onClick={entrarNaSala}
					disabled={carregando || codigoDigitado.trim().length < 4}
				>
					Entrar na sala
				</button>

				{erro && <p className="lobby__erro">{erro}</p>}
			</div>
		</div>
	);
}
