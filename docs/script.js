// EnglishLearn - script.js

const micButton = document.getElementById('micButton');
const micText = document.getElementById('micText');
const status = document.getElementById('status');
const chatContainer = document.getElementById('chatContainer');
const suggestionsContainer = document.getElementById('suggestions');
const suggestionsGrid = document.getElementById('suggestionsGrid');
const connectionStatus = document.getElementById('connectionStatus');

let isListening = false;
let recognition = null;
let sessionId = 'session_' + Date.now();
let isProcessing = false;
let hasSpoken = false;
let wordInterval = null;

// ── CONEXIÓN ──────────────────────────────────────────────────
async function checkConnection() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
            connectionStatus.textContent = '✅ Conectado';
            connectionStatus.className = 'connection-status connected';
            micButton.disabled = false;
            micText.textContent = '🎤 PRESIONA PARA HABLAR';
            status.textContent = 'Listo — presiona el botón y habla en inglés';
            return true;
        }
    } catch (e) {
        connectionStatus.textContent = '❌ Sin conexión — Render puede tardar ~30s en despertar';
        connectionStatus.className = 'connection-status error';
        micButton.disabled = true;
        micText.textContent = '⏳ Esperando servidor...';
        status.textContent = 'Intenta recargar la página en unos segundos';
    }
    return false;
}

// ── VOZ ───────────────────────────────────────────────────────
function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        status.textContent = '❌ Tu navegador no soporta voz. Usa Chrome.';
        return;
    }
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        micButton.classList.add('listening');
        micText.textContent = '🎤 ESCUCHANDO...';
        status.textContent = 'Habla ahora en inglés...';
    };

    recognition.onend = () => {
        isListening = false;
        micButton.classList.remove('listening');
        if (!isProcessing) micText.textContent = '🎤 PRESIONA PARA HABLAR';
    };

    recognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        await sendMessage(text);
    };

    recognition.onerror = (event) => {
        isListening = false;
        micButton.classList.remove('listening');
        micText.textContent = '🎤 PRESIONA PARA HABLAR';
        if (event.error === 'no-speech') {
            status.textContent = 'No escuché nada — intenta de nuevo';
        } else if (event.error === 'not-allowed') {
            status.textContent = '❌ Permiso de micrófono denegado. Actívalo en configuración del navegador.';
        } else {
            status.textContent = 'Error: ' + event.error;
        }
    };
}

// ── ENVIAR MENSAJE ────────────────────────────────────────────
async function sendMessage(text) {
    if (!text || !text.trim() || isProcessing) return;

    isProcessing = true;
    micButton.disabled = true;
    micText.textContent = '⏳ Procesando...';
    status.textContent = 'Tu tutor está pensando...';
    hideSuggestions();
    addUserMessage(text);

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/hablar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.trim(), session_id: sessionId }),
            signal: AbortSignal.timeout(30000)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Error ${res.status}`);
        }

        const data = await res.json();

        // Mostrar corrección si hay
        if (data.correction && data.correction.trim() && data.correction.toUpperCase() !== 'NONE') {
            addCorrectionMessage(data.correction);
        }

        // Respuesta del tutor
        if (data.english) {
            addTutorMessage(data.english, data.spanish || '');
        }

        // Sugerencias
        if (data.suggestions && data.suggestions.length > 0) {
            displaySuggestions(data.suggestions);
        }

        // Audio
        if (data.audio) {
            try {
                new Audio('data:audio/mp3;base64,' + data.audio).play();
            } catch (e) {}
        }

        // Activar palabras de práctica después de primera interacción
        if (!hasSpoken) {
            hasSpoken = true;
            startWordNotifications();
        }

        status.textContent = '🎤 Presiona para responder';

    } catch (err) {
        console.error('Error:', err);
        status.textContent = '❌ Error: ' + err.message;
        addTutorMessage(
            "Sorry, there was a problem. Please try again!",
            "Lo siento, hubo un problema. ¡Intenta de nuevo!"
        );
    } finally {
        isProcessing = false;
        micButton.disabled = false;
        micText.textContent = '🎤 PRESIONA PARA HABLAR';
    }
}

// ── MENSAJES EN CHAT ──────────────────────────────────────────
function addUserMessage(text) {
    const d = document.createElement('div');
    d.className = 'message user';
    d.innerHTML = `<div class="message-content"><span class="message-label">Tú</span>${esc(text)}</div>`;
    chatContainer.appendChild(d);
    scrollChat();
}

function addTutorMessage(english, spanish) {
    const d = document.createElement('div');
    d.className = 'message tutor';
    d.innerHTML = `<div class="message-content">
        <span class="message-label">🎓 Tutor</span>
        ${esc(english)}
        ${spanish ? `<div class="message-translation">📚 ${esc(spanish)}</div>` : ''}
    </div>`;
    chatContainer.appendChild(d);
    scrollChat();
}

function addCorrectionMessage(text) {
    const d = document.createElement('div');
    d.className = 'message correction';
    d.innerHTML = `<div class="message-content"><span class="message-label">✏️ Corrección</span>${esc(text)}</div>`;
    chatContainer.appendChild(d);
    scrollChat();
}

function addWordNotif(word) {
    const id = 'w_' + Date.now();
    const d = document.createElement('div');
    d.className = 'message word-notif';
    d.id = id;
    d.innerHTML = `<div class="message-content">
        <span class="message-label">💬 Palabra para practicar</span>
        ¿Cómo se dice <strong>"${esc(word.es)}"</strong> en inglés?
        <div class="message-translation">💡 Contexto: ${esc(word.contexto)}</div>
        <button class="reveal-btn" onclick="revealWord('${id}','${esc(word.en)}')">Ver respuesta</button>
    </div>`;
    chatContainer.appendChild(d);
    scrollChat();
}

function revealWord(id, answer) {
    const el = document.getElementById(id);
    if (!el) return;
    const btn = el.querySelector('.reveal-btn');
    if (btn) btn.remove();
    const rev = document.createElement('div');
    rev.className = 'revealed';
    rev.innerHTML = `✅ <strong>${esc(answer)}</strong>`;
    el.querySelector('.message-content').appendChild(rev);
}

// ── SUGERENCIAS ───────────────────────────────────────────────
function displaySuggestions(suggestions) {
    suggestionsGrid.innerHTML = '';
    suggestionsContainer.style.display = 'block';
    suggestions.forEach(s => {
        const clean = s.replace(/^\d+\.\s*/, '');
        const parts = clean.split('|');
        const eng = parts[0].trim();
        const esp = parts[1] ? parts[1].trim() : '';
        if (!eng) return;
        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.onclick = () => sendMessage(eng);
        card.innerHTML = `
            <div class="suggestion-english">${esc(eng)}</div>
            ${esp ? `<div class="suggestion-spanish">${esc(esp)}</div>` : ''}
        `;
        suggestionsGrid.appendChild(card);
    });
}

function hideSuggestions() {
    suggestionsContainer.style.display = 'none';
    suggestionsGrid.innerHTML = '';
}

// ── PALABRAS DE PRÁCTICA ──────────────────────────────────────
async function showWordNotification() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/palabra-del-dia`);
        if (!res.ok) return;
        const word = await res.json();
        addWordNotif(word);
    } catch (e) {
        console.error('Error palabra:', e);
    }
}

function startWordNotifications() {
    if (wordInterval) return;
    wordInterval = setInterval(showWordNotification, 3 * 60 * 1000);
}

// ── BOTONES ───────────────────────────────────────────────────
micButton.addEventListener('click', () => {
    if (!recognition) {
        status.textContent = '❌ Reconocimiento de voz no disponible. Usa Chrome.';
        return;
    }
    if (isListening) {
        recognition.stop();
    } else if (!isProcessing) {
        try { recognition.start(); } catch (e) { status.textContent = 'Error: ' + e.message; }
    }
});

document.getElementById('resetBtn')?.addEventListener('click', async () => {
    try {
        await fetch(`${CONFIG.API_URL}/api/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
    } catch (e) {}
    sessionId = 'session_' + Date.now();
    hasSpoken = false;
    if (wordInterval) { clearInterval(wordInterval); wordInterval = null; }
    chatContainer.innerHTML = '';
    hideSuggestions();
    addTutorMessage(
        "Hello! Let's start fresh. How are you today?",
        "¡Hola! Empecemos de nuevo. ¿Cómo estás hoy?"
    );
    status.textContent = 'Listo — presiona el botón y habla en inglés';
});

document.getElementById('wordBtn')?.addEventListener('click', showWordNotification);

// ── UTILS ─────────────────────────────────────────────────────
function scrollChat() { chatContainer.scrollTop = chatContainer.scrollHeight; }

function esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
    initRecognition();
    const ok = await checkConnection();
    if (!ok) {
        const retry = setInterval(async () => {
            if (await checkConnection()) clearInterval(retry);
        }, 15000);
    }
}

init();
