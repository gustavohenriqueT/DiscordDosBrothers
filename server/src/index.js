import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import {
	atualizarStatusVoz,
	buscarSalaPorSocket,
	canalDeTextoExiste,
	criarCanal,
	criarSala,
	entrarNaSala,
	entrarNaVoz,
	listarCanaisSerializado,
	listarParticipantes,
	membrosDoCanalDeVoz,
	sairDaSala,
	sairDaVoz,
} from "./rooms.js";

const PORT = 4000;

const app = express();
app.use(cors());
app.get("/", (_req, res) => res.send("Manzoni Muito Burro — servidor no ar"));

const httpServer = createServer(app);
const io = new Server(httpServer, {
	cors: { origin: "*" }, // uso pessoal entre amigos — sem necessidade de trava rígida aqui
});

io.on("connection", (socket) => {
	console.log(`[conectou] ${socket.id}`);

	socket.on("room:create", (perfil, callback) => {
		const sala = criarSala();
		sala.participants.set(socket.id, { ...perfil, socketId: socket.id });
		socket.join(sala.code);
		callback({
			ok: true,
			code: sala.code,
			participants: listarParticipantes(sala),
			channels: listarCanaisSerializado(sala),
		});
	});

	socket.on("room:join", ({ code, perfil }, callback) => {
		const sala = entrarNaSala(code, socket.id, {
			...perfil,
			socketId: socket.id,
		});
		if (!sala) {
			callback({ ok: false, error: "Sala não encontrada" });
			return;
		}
		socket.join(sala.code);
		callback({
			ok: true,
			code: sala.code,
			participants: listarParticipantes(sala),
			channels: listarCanaisSerializado(sala),
		});
		socket.to(sala.code).emit("room:participants", listarParticipantes(sala));
	});

	socket.on("channel:create", ({ name, type }, callback) => {
		const sala = buscarSalaPorSocket(socket.id);
		if (!sala) {
			callback?.({ ok: false, error: "Você não está em nenhuma sala." });
			return;
		}
		const canal = criarCanal(sala, name, type);
		if (!canal) {
			callback?.({ ok: false, error: "Nome de canal inválido." });
			return;
		}
		io.to(sala.code).emit("channel:list", listarCanaisSerializado(sala));
		callback?.({ ok: true, channel: canal });
	});

	socket.on("chat:message", ({ channelId, text }, callback) => {
		const sala = buscarSalaPorSocket(socket.id);
		if (!sala) {
			callback?.({ ok: false, error: "Você não está em nenhuma sala." });
			return;
		}
		if (!canalDeTextoExiste(sala, channelId)) {
			callback?.({ ok: false, error: "Canal de texto não existe." });
			return;
		}
		const autor = sala.participants.get(socket.id);
		const mensagem = {
			id: `${Date.now()}-${socket.id}`,
			channelId,
			authorId: socket.id,
			author: autor,
			text: String(text).slice(0, 500), // limite simples contra abuso
			timestamp: Date.now(),
		};
		io.to(sala.code).emit("chat:message", mensagem);
		callback?.({ ok: true });
	});

	// --- Canal de voz: sinalização WebRTC ---

	socket.on("voice:join", ({ channelId }, callback) => {
		const sala = buscarSalaPorSocket(socket.id);
		if (!sala) {
			callback?.({ ok: false, error: "Você não está em nenhuma sala." });
			return;
		}
		const jaNoCanal = membrosDoCanalDeVoz(sala, channelId);
		const resultado = entrarNaVoz(socket.id, sala, channelId);
		if (!resultado) {
			callback?.({ ok: false, error: "Canal de voz não encontrado." });
			return;
		}
		callback?.({ ok: true, channelId, peers: jaNoCanal });
		io.to(sala.code).emit("channel:list", listarCanaisSerializado(sala));
	});

	socket.on("voice:leave", () => {
		const sala = buscarSalaPorSocket(socket.id);
		if (!sala) return;
		sairDaVoz(socket.id, sala);
		socket.to(sala.code).emit("voice:peer-left", socket.id);
		io.to(sala.code).emit("channel:list", listarCanaisSerializado(sala));
	});

	socket.on("voice:status", (status) => {
		const sala = buscarSalaPorSocket(socket.id);
		if (!sala) return;
		atualizarStatusVoz(sala, socket.id, status);
		io.to(sala.code).emit("channel:list", listarCanaisSerializado(sala));
	});

	socket.on("webrtc:signal", ({ to, data }) => {
		io.to(to).emit("webrtc:signal", { from: socket.id, data });
	});

	socket.on("disconnect", () => {
		const sala = buscarSalaPorSocket(socket.id);
		if (sala) {
			sairDaVoz(socket.id, sala);
			socket.to(sala.code).emit("voice:peer-left", socket.id);
		}
		const salaAposSair = sairDaSala(socket.id);
		if (salaAposSair) {
			io.to(salaAposSair.code).emit(
				"room:participants",
				listarParticipantes(salaAposSair),
			);
			io.to(salaAposSair.code).emit(
				"channel:list",
				listarCanaisSerializado(salaAposSair),
			);
		}
		console.log(`[saiu] ${socket.id}`);
	});
});

httpServer.listen(PORT, () => {
	console.log(`Servidor rodando em http://localhost:${PORT}`);
});
