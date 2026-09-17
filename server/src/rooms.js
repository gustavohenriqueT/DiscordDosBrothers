// Estado das salas fica em memória: se o servidor reiniciar, as salas somem.
// Para o uso pretendido (você + amigos, sessões pontuais) isso é suficiente.

const rooms = new Map(); // codigo -> { code, participants, channels }

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 pra evitar confusão visual

function gerarCodigo() {
  let codigo;
  do {
    codigo = Array.from({ length: 6 }, () =>
      ALFABETO[Math.floor(Math.random() * ALFABETO.length)]
    ).join("");
  } while (rooms.has(codigo));
  return codigo;
}

function slugify(nome) {
  return (
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 24) || "canal"
  );
}

export function criarSala() {
  const code = gerarCodigo();
  const sala = {
    code,
    participants: new Map(),
    channels: new Map(),
  };
  // Toda sala nova já começa com um canal de texto e um de voz padrão.
  sala.channels.set("geral", { id: "geral", name: "geral", type: "text" });
  sala.channels.set("geral-voz", {
    id: "geral-voz",
    name: "Geral",
    type: "voice",
    voiceMembers: new Set(),
  });
  rooms.set(code, sala);
  return sala;
}

export function buscarSala(code) {
  return rooms.get(code.toUpperCase());
}

export function buscarSalaPorSocket(socketId) {
  for (const sala of rooms.values()) {
    if (sala.participants.has(socketId)) return sala;
  }
  return null;
}

export function entrarNaSala(code, socketId, perfil) {
  const sala = buscarSala(code);
  if (!sala) return null;
  sala.participants.set(socketId, perfil);
  return sala;
}

export function sairDaSala(socketId) {
  for (const sala of rooms.values()) {
    if (sala.participants.has(socketId)) {
      sala.participants.delete(socketId);
      for (const canal of sala.channels.values()) {
        if (canal.type === "voice") canal.voiceMembers.delete(socketId);
      }
      if (sala.participants.size === 0) {
        rooms.delete(sala.code);
      }
      return sala;
    }
  }
  return null;
}

export function listarParticipantes(sala) {
  return Array.from(sala.participants.values());
}

export function criarCanal(sala, nome, tipo = "text") {
  const nomeLimpo = String(nome).trim().slice(0, 32);
  if (!nomeLimpo) return null;

  let id = slugify(nomeLimpo);
  let sufixo = 2;
  while (sala.channels.has(id)) {
    id = `${slugify(nomeLimpo)}-${sufixo++}`;
  }

  const canal =
    tipo === "voice"
      ? { id, name: nomeLimpo, type: "voice", voiceMembers: new Set() }
      : { id, name: nomeLimpo, type: "text" };

  sala.channels.set(id, canal);
  return canal;
}

export function canalDeTextoExiste(sala, channelId) {
  const canal = sala.channels.get(channelId);
  return !!canal && canal.type === "text";
}

// Serializa os canais pra mandar pelo socket — Sets viram arrays de perfis.
export function listarCanaisSerializado(sala) {
  return Array.from(sala.channels.values()).map((canal) => {
    if (canal.type === "voice") {
      return {
        id: canal.id,
        name: canal.name,
        type: canal.type,
        members: Array.from(canal.voiceMembers)
          .map((id) => sala.participants.get(id))
          .filter(Boolean),
      };
    }
    return { id: canal.id, name: canal.name, type: canal.type };
  });
}

// Só é possível estar em um canal de voz por vez — entrar em um novo
// automaticamente tira a pessoa de qualquer outro canal de voz.
export function entrarNaVoz(socketId, sala, channelId) {
  const canalAlvo = sala.channels.get(channelId);
  if (!canalAlvo || canalAlvo.type !== "voice") return null;

  for (const canal of sala.channels.values()) {
    if (canal.type === "voice") canal.voiceMembers.delete(socketId);
  }
  canalAlvo.voiceMembers.add(socketId);
  return canalAlvo;
}

export function sairDaVoz(socketId, sala) {
  for (const canal of sala.channels.values()) {
    if (canal.type === "voice") canal.voiceMembers.delete(socketId);
  }
}

export function membrosDoCanalDeVoz(sala, channelId) {
  const canal = sala.channels.get(channelId);
  if (!canal || canal.type !== "voice") return [];
  return Array.from(canal.voiceMembers)
    .map((id) => sala.participants.get(id))
    .filter(Boolean);
}

export function atualizarStatusVoz(sala, socketId, { muted, deafened }) {
  const participante = sala.participants.get(socketId);
  if (!participante) return;
  if (muted !== undefined) participante.muted = muted;
  if (deafened !== undefined) participante.deafened = deafened;
}