# DiscordDosBrothers

Plataforma desktop de comunicação em tempo real e compartilhamento de tela com arquitetura **Peer-to-Peer (P2P)**, desenvolvida para grupos reduzidos de usuários. O projeto prioriza **baixa latência de vídeo/áudio**, **baixo consumo de recursos (RAM/CPU)** e **custo de infraestrutura zero para sinalização**.

## 📌 Motivação e Problema Solucionado

Ferramentas corporativas como Google Meet e Zoom, ou generalistas como Discord, podem apresentar gargalos para grupos pequenos que realizam compartilhamento contínuo de tela durante jogos ou sessões longas:

- Latência alta ou variável devido ao roteamento por servidores **SFU/MCU centralizados**.
- Alto uso de memória RAM/CPU por clientes heavyweight.

O **DiscordDosBrothers** resolve isso separando o fluxo de controle da mídia:

- A **sinalização** é leve e roda em **Node.js**.
- O tráfego de **áudio, vídeo e tela** ocorre diretamente entre as pontas via **WebRTC (`RTCPeerConnection`)**.
- Não há intermediários no fluxo de mídia.

## 🏗️ Arquitetura do Sistema

```text
[ Cliente Desktop A ] <====== WebRTC P2P (Áudio / Vídeo / Tela) ======> [ Cliente Desktop B ]
        │                                                                      │
        │                       (Apenas Sinalização)                           │
        └─────────────── WebSocket / Socket.IO (SDP e ICE) ────────────────────┘
                                        │
                                        ▼
                            [ Servidor de Sinalização ]
                             (Oracle Cloud Free Tier)
```

## 1. Cliente Desktop — Electron + React + TypeScript

### Segurança e Isolação

O processo principal (**Main Process**) é estritamente isolado do processo de renderização (**Renderer Process**) utilizando:

- `contextIsolation: true`
- `nodeIntegration: false`

### Comunicação IPC

As APIs nativas necessárias são expostas ao Renderer exclusivamente por um script `preload.ts` utilizando `contextBridge`.

### Persistência Local

Configurações e perfis de usuário são mantidos localmente no cliente através do `electron-store`, dispensando autenticação centralizada em banco de dados.

## 2. Servidor de Sinalização — Node.js + Socket.IO

### Zero Media Handling

O servidor é responsável apenas por:

- Gestão de salas/canais.
- Troca de metadados WebRTC.
- Intermediação de **Session Description Protocol (SDP)**.
- Troca de **ICE Candidates**.

O servidor **não processa nem transporta o fluxo de mídia**.

### Hospedagem

Executado em uma instância **Oracle Cloud Free Tier**, utilizando:

- Oracle Linux
- Node.js 20
- PM2 para manter o processo em execução contínua

## 3. Camada de Mídia — WebRTC Peer-to-Peer

As conexões diretas `RTCPeerConnection` são estabelecidas entre os pares após a negociação **Offer/Answer**, intermediada pelo servidor de sinalização.

```text
Cliente A
   │
   │ Offer / ICE
   ▼
Servidor de Sinalização
   │
   │ Answer / ICE
   ▼
Cliente B

Após a negociação:
Cliente A <========== WebRTC P2P ==========> Cliente B
              Áudio / Vídeo / Tela
```

## ⚡ Pontos de Implementação Relevantes

### Processamento de Áudio e Noise Gate — Web Audio API

O fluxo de áudio do microfone passa por um `AnalyserNode` para medição do nível de sinal em tempo real, funcionando como um **VU meter**.

Um `GainNode` atua como **Noise Gate**, utilizando:

- Curva de ataque rápido.
- Tempo de hold parametrizado.
- Tempo de decay/liberação parametrizado.

Isso evita o corte indesejado das sílabas finais durante a fala.

### Controle de Volume Individual por Participante

Cada stream remoto recebido é roteado por uma instância dedicada de `GainNode` no lado do cliente antes de ser enviado para a saída de áudio.

Isso permite:

- Ajuste individual de volume.
- Controle independente por participante.
- Processamento de áudio no próprio cliente.

### Renegociação Dinâmica de Trilha de Mídia — Dynamic Renegotiation

Adição e remoção de tracks de compartilhamento de tela em uma `RTCPeerConnection` ativa através de negociação **on-the-fly**.

Dessa forma, não é necessário:

- Desconectar a chamada.
- Reiniciar a conexão de voz.
- Criar uma nova `RTCPeerConnection`.

### Captura de Tela Nativa no Electron

Utilização do manipulador `setDisplayMediaRequestHandler` integrado ao seletor nativo do sistema operacional.

Permite selecionar:

- Monitor completo.
- Janela específica.
- Captura de áudio do sistema.

### Hot-swapping de Dispositivos de Entrada

Permite a troca dinâmica de dispositivos de entrada de áudio, como microfones, em tempo real e **sem interrupção do canal WebRTC estabelecido**.

## 🛠️ Tecnologias Utilizadas

### Frontend / Client

- Electron
- React
- TypeScript
- Web Audio API
- WebRTC API
- electron-store

### Backend / Signaling

- Node.js `v20+`
- Socket.IO
- PM2

### Infraestrutura

- Oracle Cloud Free Tier
- Oracle Linux

## 🚀 Como Executar o Projeto

### Pré-requisitos

Antes de executar o projeto, certifique-se de possuir:

- Node.js versão 20 ou superior
- npm ou yarn

### 1. Servidor de Sinalização

```bash
cd server

npm install

npm run dev
```

### 2. Cliente Desktop

```bash
cd client

npm install

npm run dev
```

## 📦 Build para Produção

Para gerar o executável do cliente desktop:

```bash
cd client

npm run build
```

## 📄 Licença

Este projeto é de uso pessoal e distribuído sob a licença **MIT**.