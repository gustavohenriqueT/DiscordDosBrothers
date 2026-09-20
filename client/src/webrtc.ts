import { socket } from "./socket";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

type PeerConnections = Map<string, RTCPeerConnection>;

export function criarGerenciadorDeVoz(
	onRemoteAudioStream: (peerId: string, stream: MediaStream) => void,
	onRemoteVideoStream: (peerId: string, stream: MediaStream) => void,
	onRemoteScreenAudioStream: (peerId: string, stream: MediaStream) => void,
	onPeerRemovido: (peerId: string) => void,
	onCompartilhamentoEncerradoPeloNavegador: () => void,
	onPeerParouDeCompartilhar: (peerId: string) => void,
) {
	const conexoes: PeerConnections = new Map();
	let localStream: MediaStream | null = null;
	let localScreenStream: MediaStream | null = null;

	let audioCtx: AudioContext | null = null;
	let micSource: MediaStreamAudioSourceNode | null = null;
	let analyser: AnalyserNode | null = null;
	let gateGain: GainNode | null = null;
	let destino: MediaStreamAudioDestinationNode | null = null;
	let manualMudo = false;
	let sensibilidade = 15;
	let nivelAtual = 0;
	let loopId: number | null = null;
	let ultimaVezAcimaDoLimiar = 0;
	const TEMPO_DE_ESPERA_MS = 450;

	function medirEControlarGate() {
		if (!analyser || !gateGain || !audioCtx) return;
		const dados = new Uint8Array(analyser.fftSize);
		analyser.getByteTimeDomainData(dados);

		let soma = 0;
		for (let i = 0; i < dados.length; i++) {
			const valor = (dados[i] - 128) / 128;
			soma += valor * valor;
		}
		const rms = Math.sqrt(soma / dados.length);
		nivelAtual = Math.min(100, rms * 400);

		const agora = performance.now();
		if (nivelAtual > sensibilidade) {
			ultimaVezAcimaDoLimiar = agora;
		}
		const dentroDoTempoDeEspera =
			agora - ultimaVezAcimaDoLimiar < TEMPO_DE_ESPERA_MS;

		const alvo = !manualMudo && dentroDoTempoDeEspera ? 1 : 0;
		const constanteDeTempo = alvo === 1 ? 0.01 : 0.15;
		gateGain.gain.setTargetAtTime(alvo, audioCtx.currentTime, constanteDeTempo);

		loopId = requestAnimationFrame(medirEControlarGate);
	}

	function adicionarTracksLocais(pc: RTCPeerConnection) {
		if (localStream) {
			localStream
				.getTracks()
				.forEach((track) => pc.addTrack(track, localStream!));
		}
		if (localScreenStream) {
			localScreenStream
				.getTracks()
				.forEach((track) => pc.addTrack(track, localScreenStream!));
		}
	}

	function criarConexao(peerId: string): RTCPeerConnection {
		const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

		adicionarTracksLocais(pc);

		let microfoneJaRecebido = false;

		pc.onicecandidate = (event) => {
			if (event.candidate) {
				socket.emit("webrtc:signal", {
					to: peerId,
					data: { type: "ice-candidate", candidate: event.candidate },
				});
			}
		};

		pc.oniceconnectionstatechange = () => {
			console.log(`[voz] estado ICE com ${peerId}:`, pc.iceConnectionState);
		};

		pc.ontrack = (event) => {
			const track = event.track;

			if (track.kind === "video") {
				onRemoteVideoStream(peerId, event.streams[0]);
				track.onended = () => onPeerParouDeCompartilhar(peerId);
				return;
			}

			if (!microfoneJaRecebido) {
				microfoneJaRecebido = true;
				onRemoteAudioStream(peerId, event.streams[0]);
			} else {
				onRemoteScreenAudioStream(peerId, event.streams[0]);
				track.onended = () => onPeerParouDeCompartilhar(peerId);
			}
		};

		conexoes.set(peerId, pc);
		return pc;
	}

	async function conectarComoIniciador(peerId: string) {
		const pc = criarConexao(peerId);
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		socket.emit("webrtc:signal", {
			to: peerId,
			data: { type: "offer", sdp: offer },
		});
	}

	async function tratarSinal(from: string, data: any) {
		if (data.type === "offer") {
			const pc = conexoes.get(from) ?? criarConexao(from);
			await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
			const answer = await pc.createAnswer();
			await pc.setLocalDescription(answer);
			socket.emit("webrtc:signal", {
				to: from,
				data: { type: "answer", sdp: answer },
			});
		} else if (data.type === "answer") {
			const pc = conexoes.get(from);
			await pc?.setRemoteDescription(new RTCSessionDescription(data.sdp));
		} else if (data.type === "ice-candidate") {
			const pc = conexoes.get(from);
			await pc?.addIceCandidate(new RTCIceCandidate(data.candidate));
		}
	}

	async function renegociarComTodos() {
		for (const [peerId, pc] of conexoes) {
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			socket.emit("webrtc:signal", {
				to: peerId,
				data: { type: "offer", sdp: offer },
			});
		}
	}

	async function ajustarQualidadeDeVideo(pc: RTCPeerConnection) {
		const sender = pc
			.getSenders()
			.find(
				(s) => s.track?.kind === "video" && s.track?.contentHint === "motion",
			);
		if (!sender) return;

		const params = sender.getParameters();
		if (!params.encodings || params.encodings.length === 0) {
			params.encodings = [{}];
		}
		params.encodings[0].maxBitrate = 4_000_000; // ~4 Mbps, bom para 1080p60 com movimento
		await sender.setParameters(params);
	}

	async function iniciarCompartilhamentoDeTela(fonte?: {
		sourceId?: string;
	}): Promise<MediaStream> {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: {
				frameRate: { ideal: 60, max: 60 },
			},
			audio: true,
		});
		localScreenStream = stream;

		const trackDeVideo = stream.getVideoTracks()[0];
		trackDeVideo.contentHint = "motion";

		conexoes.forEach((pc) => {
			stream.getTracks().forEach((track) => pc.addTrack(track, stream));
		});
		await renegociarComTodos();
		conexoes.forEach((pc) => ajustarQualidadeDeVideo(pc));

		trackDeVideo.onended = () => {
			pararCompartilhamentoDeTela();
			onCompartilhamentoEncerradoPeloNavegador();
		};

		return stream;
	}

	async function pararCompartilhamentoDeTela() {
		if (!localScreenStream) return;

		conexoes.forEach((pc) => {
			localScreenStream!.getTracks().forEach((track) => {
				const sender = pc.getSenders().find((s) => s.track === track);
				if (sender) pc.removeTrack(sender);
			});
		});

		localScreenStream.getTracks().forEach((t) => t.stop());
		localScreenStream = null;
		await renegociarComTodos();
	}

	function removerPeer(peerId: string) {
		conexoes.get(peerId)?.close();
		conexoes.delete(peerId);
		onPeerRemovido(peerId);
	}

	function encerrarTudo() {
		conexoes.forEach((pc) => pc.close());
		conexoes.clear();
		if (loopId !== null) cancelAnimationFrame(loopId);
		micSource?.disconnect();
		gateGain?.disconnect();
		analyser?.disconnect();
		audioCtx?.close();
		localStream?.getTracks().forEach((t) => t.stop());
		localScreenStream?.getTracks().forEach((t) => t.stop());
		localStream = null;
		localScreenStream = null;
		audioCtx = null;
	}

	async function iniciar(deviceId?: string): Promise<MediaStream> {
		const rawMicStream = await navigator.mediaDevices.getUserMedia({
			audio: deviceId ? { deviceId: { exact: deviceId } } : true,
		});

		audioCtx = new AudioContext();
		micSource = audioCtx.createMediaStreamSource(rawMicStream);
		analyser = audioCtx.createAnalyser();
		analyser.fftSize = 512;
		gateGain = audioCtx.createGain();
		gateGain.gain.value = 0;
		destino = audioCtx.createMediaStreamDestination();

		micSource.connect(analyser);
		micSource.connect(gateGain);
		gateGain.connect(destino);

		medirEControlarGate();

		localStream = destino.stream;
		return localStream;
	}

	async function trocarEntrada(deviceId: string) {
		if (!audioCtx || !analyser || !gateGain) return;
		const novoStream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: deviceId } },
		});
		micSource?.disconnect();
		micSource = audioCtx.createMediaStreamSource(novoStream);
		micSource.connect(analyser);
		micSource.connect(gateGain);
	}

	function alternarMudo(mudo: boolean) {
		manualMudo = mudo;
	}

	function definirSensibilidade(valor: number) {
		sensibilidade = valor;
	}

	function obterNivelEntrada() {
		return nivelAtual;
	}

	function obterStreamLocal() {
		return localStream;
	}

	return {
		iniciar,
		conectarComoIniciador,
		tratarSinal,
		removerPeer,
		encerrarTudo,
		alternarMudo,
		definirSensibilidade,
		trocarEntrada,
		obterNivelEntrada,
		obterStreamLocal,
		iniciarCompartilhamentoDeTela,
		pararCompartilhamentoDeTela,
	};
}
