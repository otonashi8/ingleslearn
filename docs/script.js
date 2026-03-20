// ==========================================
// EnglishLearn - script.js (versión corregida)
// ==========================================

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
let hasSpoken = false;       // Solo empezar palabras cuando el usuario habló
let wordInterval = null;

// ==========================================
// CONEXIÓN
// ==========================================
async function checkConnection() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/`, {
            signal: AbortSignal.timeout(10000)
        });
        if (response.ok) {
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

// ==========================================
// VOZ
// ==========================================
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
        if (!isProcessing) {
            micText.textContent = '🎤 PRESIONA PARA HABLAR';
        }
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
            status.textContent = 'Error de voz: ' + event.error;
        }
    };
}

// ==========================================
// ENVIAR MENSAJE
// ==========================================
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
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Error ${res.status}`);
        }

        const data = await res.json();

        // Corrección primero (si hay)
        if (data.correction && data.correction.trim() && data.correction.toUpperCase() !== 'NONE') {
            addCorrectionMessage(data.correction);
        }

        // Respuesta del tutor
        if (data.english) {
            addTutorMessage(data.english, data.spanish || '');
        }

        // Sugerencias de respuesta
        if (data.suggestions && data.suggestions.length > 0) {
            displaySuggestions(data.suggestions);
        }

        // Audio
        if (data.audio) {
            try {
                const audio = new Audio('data:audio/mp3;base64,' + data.audio);
                audio.play();
            } catch (e) { /* audio error silencioso */ }
        }

        // Activar palabras de práctica después de primera interacción
        if (!hasSpoken) {
            hasSpoken = true;
            startWordNotifications();
        }

        status.textContent = '🎤 Presiona para responder';

    } catch (err) {
        console.error('Error sendMessage:', err);
        status.textContent = '❌ Error: ' + err.message;
        addTutorMessage(
            "Sorry, there was a connection problem. Please try again!",
            "Lo siento, hubo un problema de conexión. ¡Intenta de nuevo!"
        );
    } finally {
        isProcessing = false;
        micButton.disabled = false;
        micText.textContent = '🎤 PRESIONA PARA HABLAR';
    }
}

// ==========================================
// MENSAJES
// ==========================================
function addUserMessage(text) {
    const d = document.createElement('div');
    d.className = 'message user';
    d.innerHTML = `<div class="message-content">
        <span class="message-label">Tú</span>
        ${esc(text)}
    </div>`;
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
    d.innerHTML = `<div class="message-content">
        <span class="message-label">✏️ Corrección</span>
        ${esc(text)}
    </div>`;
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
        <button class="reveal-btn" onclick="revealWord('${id}', '${esc(word.en)}')">Ver respuesta</button>
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

// ==========================================
// SUGERENCIAS
// ==========================================
function displaySuggestions(suggestions) {
    suggestionsGrid.innerHTML = '';
    suggestionsContainer.style.display = 'block';

    suggestions.forEach(s => {
        // Limpiar número al inicio: "1. texto | traduccion"
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

// ==========================================
// PALABRAS DE PRÁCTICA (solo después de hablar)
// ==========================================
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
    if (wordInterval) return; // ya está corriendo
    // Primera palabra a los 3 minutos, luego cada 3 min
    wordInterval = setInterval(showWordNotification, 3 * 60 * 1000);
}

// ==========================================
// RESET
// ==========================================
document.getElementById('resetBtn')?.addEventListener('click', async () => {
    try {
        await fetch(`${CONFIG.API_URL}/api/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
    } catch (e) {}

    // Nuevo sessionId
    sessionId = 'session_' + Date.now();
    hasSpoken = false;
    if (wordInterval) { clearInterval(wordInterval); wordInterval = null; }

    chatContainer.innerHTML = '';
    hideSuggestions();
    addTutorMessage(
        "Hello! Let's start a new conversation. How are you today?",
        "¡Hola! Empecemos una nueva conversación. ¿Cómo estás hoy?"
    );
    status.textContent = 'Listo — presiona el botón y habla en inglés';
});

// Botón de palabra manual
document.getElementById('wordBtn')?.addEventListener('click', showWordNotification);

// ==========================================
// BOTÓN MIC
// ==========================================
micButton.addEventListener('click', () => {
    if (!recognition) {
        status.textContent = '❌ Reconocimiento de voz no disponible. Usa Chrome.';
        return;
    }
    if (isListening) {
        recognition.stop();
    } else if (!isProcessing) {
        try { recognition.start(); } catch (e) { status.textContent = 'Error al activar micrófono: ' + e.message; }
    }
});

// ==========================================
// UTILIDADES
// ==========================================
function scrollChat() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

// ==========================================
// INIT
// ==========================================
async function init() {
    initRecognition();
    const ok = await checkConnection();

    if (!ok) {
        // Render duerme — reintentar cada 15s
        const retry = setInterval(async () => {
            const connected = await checkConnection();
            if (connected) clearInterval(retry);
        }, 15000);
    }
}

init();
