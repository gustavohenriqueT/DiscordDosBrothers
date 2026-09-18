import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "../global";
import { socket } from "../socket";
import { criarGerenciadorDeVoz } from "../webrtc";

type Participante = {
  id: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  socketId: string;
  muted?: boolean;
  deafened?: boolean;
};
type CanalTexto = { id: string; name: string; type: "text" };
type CanalVoz = { id: string; name: string; type: "voice"; members: Participante[] };
type Canal = CanalTexto | CanalVoz;

type Mensagem = {
  id: string;
  channelId: string;
  authorId: string;
  author: Participante;
  text: string;
  timestamp: number;
};

function IconMic({ ativo }: { ativo: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      {!ativo && <line x1="2" y1="2" x2="22" y2="22" stroke="var(--danger)" />}
    </svg>
  );
}

function IconFone({ ativo }: { ativo: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
      <path d="M21 14a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h3z" />
      <path d="M3 14a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H3z" />
      {!ativo && <line x1="2" y1="2" x2="22" y2="22" stroke="var(--danger)" />}
    </svg>
  );
}

function IconConfig() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function Room({
  code,
  participantesIniciais,
  canaisIniciais = [],
  profile,
  onSairDaSala,
}: {
  code: string;
  participantesIniciais: Participante[];
  canaisIniciais: Canal[];
  profile: Profile;
  onSairDaSala: () => void;
}) {
  const [participantes, setParticipantes] = useState(participantesIniciais);
  const [canais, setCanais] = useState<Canal[]>(canaisIniciais);

  const canaisTexto = canais.filter((c): c is CanalTexto => c.type === "text");
  const canaisVoz = canais.filter((c): c is CanalVoz => c.type === "voice");

  const [canalTextoAtualId, setCanalTextoAtualId] = useState(canaisTexto[0]?.id ?? "geral");
  const [criandoCanal, setCriandoCanal] = useState(false);
  const [nomeNovoCanal, setNomeNovoCanal] = useState("");
  const [tipoNovoCanal, setTipoNovoCanal] = useState<"text" | "voice">("text");

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const fimDaListaRef = useRef<HTMLDivElement>(null);

  const [canalVozAtualId, setCanalVozAtualId] = useState<string | null>(null);
  const [mudo, setMudo] = useState(false);
  const [surdo, setSurdo] = useState(false);
  const surdoRef = useRef(false);
  const [compartilhando, setCompartilhando] = useState(false);
  const [telasRemotas, setTelasRemotas] = useState<Map<string, MediaStream>>(new Map());

  const [perUserVolume, setPerUserVolume] = useState<Record<string, number>>({});
  const perUserVolumeRef = useRef<Record<string, number>>({});
  const [volumeAbertoPara, setVolumeAbertoPara] = useState<string | null>(null);

  const [sensibilidade, setSensibilidade] = useState(5);
  const sensibilidadeRef = useRef(5);
  const [mostrarConfiguracoes, setMostrarConfiguracoes] = useState(false);
  const [nivelMic, setNivelMic] = useState(0);

  const [dispositivosEntrada, setDispositivosEntrada] = useState<MediaDeviceInfo[]>([]);
  const [dispositivosSaida, setDispositivosSaida] = useState<MediaDeviceInfo[]>([]);
  const [entradaId, setEntradaId] = useState("");
  const [saidaId, setSaidaId] = useState("");
  const entradaIdRef = useRef("");
  const [testandoMic, setTestandoMic] = useState(false);
  const monitorAudioRef = useRef<HTMLAudioElement | null>(null);

  const gerenciadorRef = useRef<ReturnType<typeof criarGerenciadorDeVoz> | null>(null);
  const telaLocalRef = useRef<HTMLVideoElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const peerAudioRef = useRef<Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode }>>(new Map());

  useEffect(() => {
    function aoAtualizarParticipantes(lista: Participante[]) {
      setParticipantes(lista);
    }
    function aoAtualizarCanais(lista: Canal[]) {
      setCanais(lista);
    }
    function aoReceberMensagem(msg: Mensagem) {
      setMensagens((atual) => [...atual, msg]);
    }
    async function aoReceberSinal({ from, data }: { from: string; data: any }) {
      await gerenciadorRef.current?.tratarSinal(from, data);
    }
    function aoPeerSairDaVoz(peerId: string) {
      gerenciadorRef.current?.removerPeer(peerId);
      const entrada = peerAudioRef.current.get(peerId);
      entrada?.source.disconnect();
      entrada?.gain.disconnect();
      peerAudioRef.current.delete(peerId);
      setTelasRemotas((atual) => {
        const nova = new Map(atual);
        nova.delete(peerId);
        return nova;
      });
    }

    socket.on("room:participants", aoAtualizarParticipantes);
    socket.on("channel:list", aoAtualizarCanais);
    socket.on("chat:message", aoReceberMensagem);
    socket.on("webrtc:signal", aoReceberSinal);
    socket.on("voice:peer-left", aoPeerSairDaVoz);

    return () => {
      socket.off("room:participants", aoAtualizarParticipantes);
      socket.off("channel:list", aoAtualizarCanais);
      socket.off("chat:message", aoReceberMensagem);
      socket.off("webrtc:signal", aoReceberSinal);
      socket.off("voice:peer-left", aoPeerSairDaVoz);
    };
  }, []);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, canalTextoAtualId]);
  useEffect(() => {
    if (!mostrarConfiguracoes) return;
    const id = setInterval(() => {
      setNivelMic(gerenciadorRef.current?.obterNivelEntrada() ?? 0);
    }, 100);
    return () => clearInterval(id);
  }, [mostrarConfiguracoes]);

  useEffect(() => {
    if (mostrarConfiguracoes) carregarDispositivos();
  }, [mostrarConfiguracoes]);

  const mensagensDoCanal = useMemo(
    () => mensagens.filter((m) => m.channelId === canalTextoAtualId),
    [mensagens, canalTextoAtualId]
  );

  async function carregarDispositivos() {
    try {
      const todos = await navigator.mediaDevices.enumerateDevices();
      setDispositivosEntrada(todos.filter((d) => d.kind === "audioinput"));
      setDispositivosSaida(todos.filter((d) => d.kind === "audiooutput"));
    } catch (err) {
      console.error("Não foi possível listar dispositivos de áudio:", err);
    }
  }

  function enviar() {
    const conteudo = texto.trim();
    if (!conteudo) return;
    socket.emit("chat:message", { channelId: canalTextoAtualId, text: conteudo });
    setTexto("");
  }

  function confirmarNovoCanal() {
    const nome = nomeNovoCanal.trim();
    if (!nome) return;
    socket.emit("channel:create", { name: nome, type: tipoNovoCanal }, (resposta: any) => {
      if (resposta.ok && resposta.channel.type === "text") {
        setCanalTextoAtualId(resposta.channel.id);
      }
    });
    setNomeNovoCanal("");
    setCriandoCanal(false);
    setTipoNovoCanal("text");
  }

  function garantirAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      const ctx = new AudioContext();
      const masterGain = ctx.createGain();
      masterGain.gain.value = surdoRef.current ? 0 : 1;
      masterGain.connect(ctx.destination);
      audioContextRef.current = ctx;
      masterGainRef.current = masterGain;
      if (saidaId) aplicarSaida(saidaId);
    }
    return audioContextRef.current;
  }

  function tocarAudioRemoto(peerId: string, stream: MediaStream) {
    const ctx = garantirAudioContext();
    const existente = peerAudioRef.current.get(peerId);
    existente?.source.disconnect();
    existente?.gain.disconnect();

    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = (perUserVolumeRef.current[peerId] ?? 100) / 100;
    source.connect(gain);
    gain.connect(masterGainRef.current!);
    peerAudioRef.current.set(peerId, { source, gain });
  }

  function ajustarVolumeDoUsuario(peerId: string, percent: number) {
    perUserVolumeRef.current = { ...perUserVolumeRef.current, [peerId]: percent };
    setPerUserVolume(perUserVolumeRef.current);
    const entrada = peerAudioRef.current.get(peerId);
    if (entrada) entrada.gain.gain.value = percent / 100;
  }

  function exibirVideoRemoto(peerId: string, stream: MediaStream) {
    setTelasRemotas((atual) => new Map(atual).set(peerId, stream));
  }

  async function entrarNoCanalDeVoz(channelId: string) {
    if (canalVozAtualId && canalVozAtualId !== channelId) {
      sairDoCanalDeVoz();
    } else if (canalVozAtualId === channelId) {
      return;
    }

    const gerenciador = criarGerenciadorDeVoz(
      tocarAudioRemoto,
      exibirVideoRemoto,
      (peerId) => {
        const entrada = peerAudioRef.current.get(peerId);
        entrada?.source.disconnect();
        entrada?.gain.disconnect();
        peerAudioRef.current.delete(peerId);
      },
      () => setCompartilhando(false)
    );
    gerenciadorRef.current = gerenciador;

    await gerenciador.iniciar(entradaIdRef.current || undefined);
    gerenciador.definirSensibilidade(sensibilidadeRef.current);

    socket.emit(
      "voice:join",
      { channelId },
      async (resposta: { ok: boolean; peers?: Participante[] }) => {
        if (!resposta.ok) return;
        setCanalVozAtualId(channelId);
        for (const peer of resposta.peers ?? []) {
          await gerenciador.conectarComoIniciador(peer.socketId);
        }
      }
    );
  }

  function sairDaSalaClique() {
    sairDoCanalDeVoz();
    onSairDaSala();
  }

  function sairDoCanalDeVoz() {
    gerenciadorRef.current?.encerrarTudo();
    gerenciadorRef.current = null;
    peerAudioRef.current.forEach(({ source, gain }) => {
      source.disconnect();
      gain.disconnect();
    });
    peerAudioRef.current.clear();
    audioContextRef.current?.close();
    audioContextRef.current = null;
    masterGainRef.current = null;
    monitorAudioRef.current?.pause();
    setTestandoMic(false);
    setTelasRemotas(new Map());
    socket.emit("voice:leave");
    setCanalVozAtualId(null);
    setMudo(false);
    surdoRef.current = false;
    setSurdo(false);
    setCompartilhando(false);
  }

  function alternarMudo() {
    const novoEstado = !mudo;
    gerenciadorRef.current?.alternarMudo(novoEstado);
    setMudo(novoEstado);
    socket.emit("voice:status", { muted: novoEstado });
    if (!novoEstado && surdo) {
      surdoRef.current = false;
      setSurdo(false);
      if (masterGainRef.current) masterGainRef.current.gain.value = 1;
      socket.emit("voice:status", { deafened: false });
    }
  }

  function alternarSurdo() {
    const novoEstado = !surdo;
    surdoRef.current = novoEstado;
    setSurdo(novoEstado);
    if (masterGainRef.current) masterGainRef.current.gain.value = novoEstado ? 0 : 1;
    socket.emit("voice:status", { deafened: novoEstado });
    if (novoEstado && !mudo) {
      gerenciadorRef.current?.alternarMudo(true);
      setMudo(true);
      socket.emit("voice:status", { muted: true });
    }
  }

  function alterarSensibilidade(valor: number) {
    sensibilidadeRef.current = valor;
    setSensibilidade(valor);
    gerenciadorRef.current?.definirSensibilidade(valor);
  }

  async function selecionarEntrada(deviceId: string) {
    setEntradaId(deviceId);
    entradaIdRef.current = deviceId;
    if (gerenciadorRef.current) {
      await gerenciadorRef.current.trocarEntrada(deviceId);
      if (testandoMic && monitorAudioRef.current) {
        monitorAudioRef.current.srcObject = gerenciadorRef.current.obterStreamLocal();
      }
    }
  }

  async function aplicarSaida(deviceId: string) {
    const ctx = audioContextRef.current as any;
    if (ctx && typeof ctx.setSinkId === "function") {
      try {
        await ctx.setSinkId(deviceId);
      } catch (err) {
        console.error("Não foi possível trocar a saída de áudio:", err);
      }
    }
    const audio = monitorAudioRef.current as any;
    if (audio && typeof audio.setSinkId === "function") {
      try {
        await audio.setSinkId(deviceId);
      } catch (err) {
        console.error("Não foi possível trocar a saída do teste de microfone:", err);
      }
    }
  }

  async function selecionarSaida(deviceId: string) {
    setSaidaId(deviceId);
    await aplicarSaida(deviceId);
  }

  function alternarTesteMicrofone() {
    if (!gerenciadorRef.current) return;
    if (!testandoMic) {
      const stream = gerenciadorRef.current.obterStreamLocal();
      if (!stream) return;
      if (!monitorAudioRef.current) {
        monitorAudioRef.current = new Audio();
        monitorAudioRef.current.autoplay = true;
      }
      monitorAudioRef.current.srcObject = stream;
      if (saidaId) aplicarSaida(saidaId);
      monitorAudioRef.current.play().catch((err) => console.error("Erro ao testar microfone:", err));
      setTestandoMic(true);
    } else {
      monitorAudioRef.current?.pause();
      setTestandoMic(false);
    }
  }

  async function alternarCompartilhamento() {
    if (!compartilhando) {
      try {
        const stream = await gerenciadorRef.current?.iniciarCompartilhamentoDeTela();
        if (stream && telaLocalRef.current) {
          telaLocalRef.current.srcObject = stream;
        }
        setCompartilhando(true);
      } catch (err) {
        console.error("Compartilhamento cancelado ou não permitido:", err);
      }
    } else {
      await gerenciadorRef.current?.pararCompartilhamentoDeTela();
      setCompartilhando(false);
    }
  }

  function alternarTelaCheia(elemento: HTMLVideoElement | null) {
    if (!elemento) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      elemento.requestFullscreen();
    }
  }

  const canalTextoAtual = canaisTexto.find((c) => c.id === canalTextoAtualId);

  return (
    <div className="room">
      <header className="room__header">
        <button className="sair-sala-botao" onClick={sairDaSalaClique} title="Sair da sala">
          ← Sair
        </button>
        <span>Sala</span>
        <strong className="room__code">{code}</strong>
        <button className="config-botao" onClick={() => setMostrarConfiguracoes(true)} title="Configurações de voz">
          <IconConfig />
        </button>
      </header>

      <div className="room__corpo room__corpo--com-canais">
        <nav className="canais">
          <div className="canais__secao">
            <h2>Texto</h2>
            <ul>
              {canaisTexto.map((c) => (
                <li key={c.id}>
                  <button
                    className={`canal-item ${c.id === canalTextoAtualId ? "canal-item--ativo" : ""}`}
                    onClick={() => setCanalTextoAtualId(c.id)}
                  >
                    # {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="canais__secao">
            <h2>Voz</h2>
            <ul>
              {canaisVoz.map((c) => (
                <li key={c.id}>
                  <button
                    className={`canal-item ${c.id === canalVozAtualId ? "canal-item--ativo" : ""}`}
                    onClick={() => entrarNoCanalDeVoz(c.id)}
                  >
                    🔊 {c.name}
                  </button>
                  {c.members.length > 0 && (
                    <ul className="canal-membros">
                      {c.members.map((m) => {
                        const souEu = m.socketId === socket.id;
                        return (
                          <li key={m.socketId}>
                            <button
                              className="membro-linha"
                              onClick={() => !souEu && setVolumeAbertoPara(volumeAbertoPara === m.socketId ? null : m.socketId)}
                            >
                              <span className="avatar-badge avatar-badge--tiny" style={{ background: m.avatarColor }}>
                                {m.avatarEmoji}
                              </span>
                              <span className="canal-membro__nome">{m.name}</span>
                              <span className="canal-membro__icones">
                                {m.muted && <IconMic ativo={false} />}
                                {m.deafened && <IconFone ativo={false} />}
                              </span>
                            </button>
                            {volumeAbertoPara === m.socketId && !souEu && (
                              <div className="volume-usuario">
                                <span>Volume do usuário</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={200}
                                  value={perUserVolume[m.socketId] ?? 100}
                                  onChange={(e) => ajustarVolumeDoUsuario(m.socketId, Number(e.target.value))}
                                />
                                <span className="volume-usuario__valor">{perUserVolume[m.socketId] ?? 100}%</span>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {criandoCanal ? (
            <div className="canal-novo">
              <input
                autoFocus
                value={nomeNovoCanal}
                onChange={(e) => setNomeNovoCanal(e.target.value)}
                placeholder="nome-do-canal"
                maxLength={32}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmarNovoCanal();
                  if (e.key === "Escape") setCriandoCanal(false);
                }}
              />
              <div className="canal-novo__tipo">
                <button
                  className={tipoNovoCanal === "text" ? "tipo-ativo" : ""}
                  onClick={() => setTipoNovoCanal("text")}
                >
                  # Texto
                </button>
                <button
                  className={tipoNovoCanal === "voice" ? "tipo-ativo" : ""}
                  onClick={() => setTipoNovoCanal("voice")}
                >
                  🔊 Voz
                </button>
              </div>
              <button className="primary-button" onClick={confirmarNovoCanal}>
                Criar
              </button>
            </div>
          ) : (
            <button className="canal-adicionar" onClick={() => setCriandoCanal(true)}>
              + Novo canal
            </button>
          )}

          {canalVozAtualId && (
            <div className="voz-controles voz-controles--fixo">
              <div className="voz-icones">
                <button
                  className={`icone-botao ${mudo ? "icone-botao--ativo" : ""}`}
                  onClick={alternarMudo}
                  title={mudo ? "Ativar microfone" : "Mutar microfone"}
                >
                  <IconMic ativo={!mudo} />
                </button>
                <button
                  className={`icone-botao ${surdo ? "icone-botao--ativo" : ""}`}
                  onClick={alternarSurdo}
                  title={surdo ? "Reativar áudio" : "Silenciar tudo"}
                >
                  <IconFone ativo={!surdo} />
                </button>
              </div>
              <button className="secondary-button" onClick={alternarCompartilhamento}>
                {compartilhando ? "Parar compartilhamento" : "Compartilhar tela"}
              </button>
              <button className="voz-sair" onClick={sairDoCanalDeVoz}>
                Sair da voz
              </button>
            </div>
          )}
        </nav>

        <aside className="room__participantes">
          <h2>Quem está aqui</h2>
          <ul>
            {participantes.map((p) => (
              <li key={p.socketId}>
                <span className="avatar-badge avatar-badge--small" style={{ background: p.avatarColor }}>
                  {p.avatarEmoji}
                </span>
                {p.name}
                {p.socketId === socket.id && <em> (você)</em>}
              </li>
            ))}
          </ul>
        </aside>

        <section className="room__chat">
          {(compartilhando || telasRemotas.size > 0) && (
            <div className="telas-grid">
              {compartilhando && (
                <div
                  className="tela-item"
                  onDoubleClick={(e) => alternarTelaCheia(e.currentTarget.querySelector("video"))}
                >
                  <video ref={telaLocalRef} autoPlay muted playsInline />
                  <span className="tela-item__label">Sua tela</span>
                  <button
                    className="tela-item__expandir"
                    onClick={(e) =>
                      alternarTelaCheia(e.currentTarget.parentElement?.querySelector("video") ?? null)
                    }
                    title="Tela cheia"
                  >
                    ⛶
                  </button>
                </div>
              )}
              {Array.from(telasRemotas.entries()).map(([peerId, stream]) => {
                const autor = participantes.find((p) => p.socketId === peerId);
                return (
                  <div
                    className="tela-item"
                    key={peerId}
                    onDoubleClick={(e) => alternarTelaCheia(e.currentTarget.querySelector("video"))}
                  >
                    <video
                      autoPlay
                      playsInline
                      ref={(el) => {
                        if (el) el.srcObject = stream;
                      }}
                    />
                    <span className="tela-item__label">{autor?.name ?? "Alguém"}</span>
                    <button
                      className="tela-item__expandir"
                      onClick={(e) =>
                        alternarTelaCheia(e.currentTarget.parentElement?.querySelector("video") ?? null)
                      }
                      title="Tela cheia"
                    >
                      ⛶
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="room__chat-titulo"># {canalTextoAtual?.name}</div>

          <div className="room__mensagens">
            {mensagensDoCanal.map((m) => (
              <div key={m.id} className="mensagem">
                <span className="avatar-badge avatar-badge--small" style={{ background: m.author.avatarColor }}>
                  {m.author.avatarEmoji}
                </span>
                <div>
                  <div className="mensagem__autor">{m.author.name}</div>
                  <div className="mensagem__texto">{m.text}</div>
                </div>
              </div>
            ))}
            <div ref={fimDaListaRef} />
          </div>

          <div className="room__campo-mensagem">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={`Conversar em #${canalTextoAtual?.name ?? ""}`}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
            />
            <button className="primary-button" onClick={enviar} disabled={!texto.trim()}>
              Enviar
            </button>
          </div>
        </section>
      </div>

      {mostrarConfiguracoes && (
        <div className="config-overlay" onClick={() => setMostrarConfiguracoes(false)}>
          <div className="config-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Voz</h2>

            <div className="config-campo">
              <span>Entrada de áudio (microfone)</span>
              <select value={entradaId} onChange={(e) => selecionarEntrada(e.target.value)}>
                <option value="">Padrão do sistema</option>
                {dispositivosEntrada.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Microfone sem nome"}
                  </option>
                ))}
              </select>
            </div>

            <div className="config-campo">
              <span>Saída de áudio (alto-falante)</span>
              <select value={saidaId} onChange={(e) => selecionarSaida(e.target.value)}>
                <option value="">Padrão do sistema</option>
                {dispositivosSaida.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Saída sem nome"}
                  </option>
                ))}
              </select>
            </div>

            <div className="config-campo">
              <span>Sensibilidade do microfone</span>
              <input
                type="range"
                min={0}
                max={100}
                value={sensibilidade}
                onChange={(e) => alterarSensibilidade(Number(e.target.value))}
              />
              <div className="mic-medidor">
                <div
                  className="mic-medidor__preenchimento"
                  style={{
                    width: `${nivelMic}%`,
                    background: nivelMic > sensibilidade ? "var(--accent)" : "var(--text-faint)",
                  }}
                />
                <div className="mic-medidor__limiar" style={{ left: `${sensibilidade}%` }} />
              </div>
              {!canalVozAtualId && (
                <p className="config-aviso">Entre em um canal de voz para ver o nível do microfone.</p>
              )}
            </div>

            <button
              className="secondary-button"
              onClick={alternarTesteMicrofone}
              disabled={!canalVozAtualId}
            >
              {testandoMic ? "Parar de me escutar" : "Testar microfone (me escutar)"}
            </button>

            <button className="secondary-button config-fechar" onClick={() => setMostrarConfiguracoes(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}