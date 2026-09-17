import { useMemo, useState } from "react";
import type { Profile } from "../global";

const CORES = ["#E3B23C", "#5B8C7A", "#B4654A", "#5C7AB0", "#9A6BC7"];
const EMOJIS = ["🦊", "🐢", "🐧", "🦉", "🐝", "🐙", "🦔", "🐿️"];

function gerarId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ProfileSetup({
  onDone,
}: {
  onDone: (profile: Profile) => void;
}) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [salvando, setSalvando] = useState(false);

  const nomeValido = nome.trim().length >= 2;
  const idPreview = useMemo(gerarId, []);

  async function confirmar() {
    if (!nomeValido) return;
    setSalvando(true);
    const profile: Profile = {
      id: idPreview,
      name: nome.trim(),
      avatarColor: cor,
      avatarEmoji: emoji,
    };
    const salvo = await window.api.saveProfile(profile);
    onDone(salvo);
  }

  return (
    <div className="profile-setup">
      <aside className="profile-setup__brand">
        <span className="profile-setup__brand-mark">Manzoni Muito Burro</span>
        <p className="profile-setup__brand-copy">
          Vai se fuder Janja aqui é a tropa do Manzoni Muito Burro, VAI CORINTHIANS.
          MORRA GUI SEU ABUSER, AQUI VOCÊ NÃO MANDA EM NADA
        </p>
        <div
          className="profile-setup__preview"
          style={{ background: cor }}
          aria-hidden
        >
          {emoji}
        </div>
      </aside>

      <section className="profile-setup__form">
        <h1>Como quer aparecer?</h1>

        <label className="field">
          <span>Nome de exibição</span>
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Gustavo"
            maxLength={24}
            onKeyDown={(e) => e.key === "Enter" && confirmar()}
          />
        </label>

        <div className="field">
          <span>Cor do avatar</span>
          <div className="swatches">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${c === cor ? "swatch--selected" : ""}`}
                style={{ background: c }}
                onClick={() => setCor(c)}
                aria-label={`Escolher cor ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span>Ícone</span>
          <div className="swatches">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-option ${e === emoji ? "emoji-option--selected" : ""}`}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <button
          className="primary-button"
          disabled={!nomeValido || salvando}
          onClick={confirmar}
        >
          {salvando ? "Salvando…" : "Continuar"}
        </button>
      </section>
    </div>
  );
}