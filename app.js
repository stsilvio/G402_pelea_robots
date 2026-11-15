const isHttps = window.location.protocol === "https:";

const BROKER_PRESETS = {
  emqx: isHttps ? "wss://broker.emqx.io:8084/mqtt" : "ws://broker.emqx.io:8083/mqtt",
  hivemq: isHttps ? "wss://broker.hivemq.com:8884/mqtt" : "ws://broker.hivemq.com:8000/mqtt",
  mosquitto: isHttps ? "wss://test.mosquitto.org:8081" : "ws://test.mosquitto.org:8080"
};

const state = {
  brokerUrl: localStorage.getItem("g402_broker") || BROKER_PRESETS.emqx,
  topic: localStorage.getItem("g402_topic") || "G402/Robot",
  controlTopic: localStorage.getItem("g402_control_topic") || "G408/control",
  J1: {
    name: localStorage.getItem("g402_name_J1") || "Nombre Jugador 1",
    score: 0,
    penalty: 0,
    online: false,
    ip: null
  },
  J2: {
    name: localStorage.getItem("g402_name_J2") || "Nombre Jugador 2",
    score: 0,
    penalty: 0,
    online: false,
    ip: null
  }
};

const el = {
  statusPill: document.getElementById("statusPill"),
  statusText: document.getElementById("statusText"),
  brokerSelect: document.getElementById("brokerSelect"),
  panelJ1: document.getElementById("panelJ1"),
  panelJ2: document.getElementById("panelJ2"),
  deviceJ1: document.getElementById("deviceJ1"),
  deviceTextJ1: document.getElementById("deviceTextJ1"),
  deviceJ2: document.getElementById("deviceJ2"),
  deviceTextJ2: document.getElementById("deviceTextJ2"),
  nameJ1: document.getElementById("nameJ1"),
  nameJ2: document.getElementById("nameJ2"),
  scoreJ1: document.getElementById("scoreJ1"),
  scoreJ2: document.getElementById("scoreJ2"),
  penaltyJ1: document.getElementById("penaltyJ1"),
  penaltyJ2: document.getElementById("penaltyJ2"),
  finalJ1: document.getElementById("finalJ1"),
  finalJ2: document.getElementById("finalJ2"),
  modalConfig: document.getElementById("modalConfig"),
  inputBroker: document.getElementById("inputBroker"),
  inputTopic: document.getElementById("inputTopic"),
  inputControlTopic: document.getElementById("inputControlTopic")
};

let client = null;

function syncBrokerSelect() {
  const matchedKey = Object.keys(BROKER_PRESETS).find(
    (key) => BROKER_PRESETS[key] === state.brokerUrl
  );
  el.brokerSelect.value = matchedKey || "custom";
}

function renderDeviceStatus(jugador, badgeEl, textEl) {
  const info = state[jugador];
  badgeEl.classList.toggle("online", info.online);
  if (info.online) {
    textEl.textContent = info.ip ? `En línea · IP: ${info.ip}` : "En línea";
  } else {
    textEl.textContent = "Esperando conexión...";
  }
}

function render() {
  const final1 = state.J1.score - state.J1.penalty;
  const final2 = state.J2.score - state.J2.penalty;

  el.scoreJ1.textContent = state.J1.score;
  el.scoreJ2.textContent = state.J2.score;
  el.penaltyJ1.textContent = state.J1.penalty;
  el.penaltyJ2.textContent = state.J2.penalty;
  el.finalJ1.textContent = final1;
  el.finalJ2.textContent = final2;

  renderDeviceStatus("J1", el.deviceJ1, el.deviceTextJ1);
  renderDeviceStatus("J2", el.deviceJ2, el.deviceTextJ2);

  el.panelJ1.classList.toggle("winner", final1 > final2 && (final1 > 0 || final2 > 0));
  el.panelJ2.classList.toggle("winner", final2 > final1 && (final1 > 0 || final2 > 0));
}

function flashPanel(jugador) {
  const panel = jugador === "J1" ? el.panelJ1 : el.panelJ2;
  const scoreEl = jugador === "J1" ? el.scoreJ1 : el.scoreJ2;
  const flashClass = jugador === "J1" ? "flash-j1" : "flash-j2";

  panel.classList.remove(flashClass);
  scoreEl.classList.remove("bump");
  void panel.offsetWidth;
  panel.classList.add(flashClass);
  scoreEl.classList.add("bump");

  setTimeout(() => {
    panel.classList.remove(flashClass);
    scoreEl.classList.remove("bump");
  }, 350);
}

function cambiarPenalizacion(jugador, delta) {
  const next = state[jugador].penalty + delta;
  state[jugador].penalty = Math.max(0, next);
  render();
}

window.cambiarPenalizacion = cambiarPenalizacion;

// El Arduino publica {"Jugador":J1,"Puntaje":1} o {"Jugador":J1,"IP":192.168.1.50}
// (sin comillas en J1/J2 ni en la IP), o JSON estándar. Soportamos ambos formatos.
function parseArduinoPayload(raw) {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch (_) {
    const normalized = text.replace(
      /:\s*([^",{\[\s][^,}]*?)\s*(?=[,}])/g,
      (_match, val) => {
        if (/^(true|false|null|-?\d+(\.\d+)?)$/i.test(val)) {
          return `:${val}`;
        }
        return `:"${val}"`;
      }
    );
    return JSON.parse(normalized);
  }
}

function setStatus(type, message) {
  el.statusPill.classList.remove("connected", "error");
  if (type === "connected") el.statusPill.classList.add("connected");
  if (type === "error") el.statusPill.classList.add("error");
  el.statusText.textContent = message;
}

function getBrokerHostLabel(url) {
  try {
    return new URL(url).host;
  } catch (_) {
    return url;
  }
}

function connectMqtt() {
  if (typeof mqtt === "undefined") {
    setStatus("error", "No se pudo cargar la librería MQTT.js");
    return;
  }

  if (client) {
    client.end(true);
  }

  const hostLabel = getBrokerHostLabel(state.brokerUrl);
  setStatus("connecting", `Conectando a ${hostLabel}...`);

  const clientId = "VisorG402_" + Math.random().toString(16).slice(2, 10);
  client = mqtt.connect(state.brokerUrl, {
    clientId,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 10000
  });

  client.on("connect", () => {
    setStatus("connected", `Conectado (${hostLabel}) · ${state.topic} + ${state.controlTopic}`);
    client.subscribe([state.topic, state.controlTopic], (err) => {
      if (err) {
        setStatus("error", "Error al suscribirse a los tópicos");
      }
    });
  });

  client.on("reconnect", () => {
    setStatus("connecting", `Reconectando a ${hostLabel}...`);
  });

  client.on("error", () => {
    setStatus("error", `Error de conexión con ${hostLabel}`);
  });

  client.on("close", () => {
    if (client && !client.reconnecting) {
      setStatus("error", `Desconectado de ${hostLabel}`);
    }
  });

  client.on("message", (topic, payload) => {
    try {
      const data = parseArduinoPayload(payload.toString());
      const jugadorRaw = String(data.Jugador || data.jugador || "").trim().toUpperCase();
      if (jugadorRaw !== "J1" && jugadorRaw !== "J2") return;

      if (topic === state.controlTopic || data.IP !== undefined || data.ip !== undefined) {
        const ip = String(data.IP ?? data.ip ?? "").trim();
        state[jugadorRaw].online = true;
        if (ip) {
          state[jugadorRaw].ip = ip;
        }
        render();
        return;
      }

      const puntaje = Number(data.Puntaje ?? data.puntaje);
      if (Number.isFinite(puntaje)) {
        state[jugadorRaw].score = puntaje;
        state[jugadorRaw].online = true;
        render();
        flashPanel(jugadorRaw);
      }
    } catch (err) {
      console.warn("Mensaje MQTT no reconocido:", payload.toString(), err);
    }
  });
}

function changeBroker(newBrokerUrl) {
  state.brokerUrl = newBrokerUrl;
  localStorage.setItem("g402_broker", newBrokerUrl);
  syncBrokerSelect();
  connectMqtt();
}

function openConfigModal() {
  el.inputBroker.value = state.brokerUrl;
  el.inputTopic.value = state.topic;
  el.inputControlTopic.value = state.controlTopic;
  el.modalConfig.classList.add("open");
}

function closeConfigModal() {
  el.modalConfig.classList.remove("open");
  syncBrokerSelect();
}

function initEvents() {
  el.nameJ1.value = state.J1.name;
  el.nameJ2.value = state.J2.name;

  el.nameJ1.addEventListener("input", () => {
    state.J1.name = el.nameJ1.value;
    localStorage.setItem("g402_name_J1", state.J1.name);
  });

  el.nameJ2.addEventListener("input", () => {
    state.J2.name = el.nameJ2.value;
    localStorage.setItem("g402_name_J2", state.J2.name);
  });

  el.brokerSelect.addEventListener("change", () => {
    const selected = el.brokerSelect.value;
    if (selected === "custom") {
      openConfigModal();
      return;
    }
    if (BROKER_PRESETS[selected]) {
      changeBroker(BROKER_PRESETS[selected]);
    }
  });

  document.getElementById("btnReset").addEventListener("click", () => {
    state.J1.score = 0;
    state.J1.penalty = 0;
    state.J2.score = 0;
    state.J2.penalty = 0;
    render();
  });

  document.getElementById("btnConfig").addEventListener("click", openConfigModal);
  document.getElementById("btnCancelConfig").addEventListener("click", closeConfigModal);

  document.getElementById("btnSaveConfig").addEventListener("click", () => {
    const newBroker = el.inputBroker.value.trim();
    const newTopic = el.inputTopic.value.trim();
    const newControlTopic = el.inputControlTopic.value.trim();
    if (newBroker && newTopic && newControlTopic) {
      state.topic = newTopic;
      state.controlTopic = newControlTopic;
      localStorage.setItem("g402_topic", newTopic);
      localStorage.setItem("g402_control_topic", newControlTopic);
      el.modalConfig.classList.remove("open");
      changeBroker(newBroker);
    }
  });
}

initEvents();
syncBrokerSelect();
render();
connectMqtt();
