// ==========================================
// EnglishLearn - Script mejorado
// ==========================================

// Elementos del DOM
const micButton = document.getElementById('micButton');
const micText = document.getElementById('micText');
const status = document.getElementById('status');
const chatContainer = document.getElementById('chatContainer');
const suggestionsContainer = document.getElementById('suggestions');
const suggestionsGrid = document.getElementById('suggestionsGrid');
const connectionStatus = document.getElementById('connectionStatus');

// Estado
let isListening = false;
let recognition = null;
let sessionId = 'session_' + Date.now();
let wordNotifInterval = null;
let isProcessing = false;

// ==========================================
// CONEXIÓN AL BACKEND
// ==========================================
async function checkConnection() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/`, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
            connectionStatus.textContent = '✅ Conectado';
            connectionStatus.className = 'connection-status connected';
            micButton.disabled = false;
            micText.textContent = '🎤 PRESIONA PARA HABLAR';
            status.textContent = 'Listo — presiona el botón y habla en inglés';
            return true;
        }
    } catch (error) {
        connectionStatus.textContent = '❌ Sin conexión al servidor';
        connectionStatus.className = 'connection-status error';
        micButton.disabled = true;
        micText.textContent = '⏳ Servidor no disponible';
        status.textContent = 'No se puede conectar. Render puede tardar ~30s en despertar.';
        return false;
    }
}

// ==========================================
// RECONOCIMIENTO DE VOZ
// ==========================================
function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        status.textContent = '❌ Tu navegador no soporta reconocimiento de voz. Usa Chrome.';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        micButton.classList.add('listening');
        micText.textContent = '🎤 ESCUCHANDO...';
        status.textContent = '🎤 Habla ahora en inglés...';
    };

    recognition.onend = () => {
        isListening = false;
        micButton.classList.remove('listening');
        micText.textContent = isProcessing ? '⏳ Procesando...' : '🎤 PRESIONA PARA HABLAR';
    };

    recognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        await sendMessage(text);
    };

    recognition.onerror = (event) => {
        isListening = false;
        micButton.classList.remove('listening');
        if (event.error === 'no-speech') {
            status.textContent = 'No escuché nada. Intenta de nuevo.';
        } else if (event.error === 'not-allowed') {
            status.textContent = '❌ Permiso de micrófono denegado. Actívalo en tu navegador.';
        } else {
            status.textContent = '❌ Error: ' + event.error;
        }
    };
}

// ==========================================
// ENVIAR MENSAJE AL TUTOR
// ==========================================
async function sendMessage(text) {
    if (!text.trim() || isProcessing) return;

    isProcessing = true;
    micButton.disabled = true;
    micText.textContent = '⏳ Procesando...';

    // Mostrar lo que el usuario dijo
    addUserMessage(text);
    status.textContent = '🤔 Tu tutor está pensando...';
    hideSuggestions();

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/hablar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, session_id: sessionId })
        });

        if (!response.ok) throw new Error('Error en el servidor');

        const data = await response.json();

        // Mostrar corrección si hay error
        if (data.correction && data.correction.trim()) {
            addCorrectionMessage(data.correction);
        }

        // Mostrar respuesta del tutor
        if (data.english) {
            addTutorMessage(data.english, data.spanish);
        }

        // Mostrar sugerencias de RESPUESTA
        if (data.suggestions && data.suggestions.length > 0) {
            displaySuggestions(data.suggestions);
        }

        // Reproducir audio
        if (data.audio) {
            const audio = new Audio('data:audio/mp3;base64,' + data.audio);
            audio.play();
        }

        status.textContent = '🎤 Presiona para responder';

    } catch (error) {
        console.error('Error:', error);
        status.textContent = '❌ Error de conexión. Intenta de nuevo.';
        addTutorMessage("Sorry, I had a connection problem. Try again!", "Lo siento, tuve un problema de conexión. ¡Intenta de nuevo!");
    } finally {
        isProcessing = false;
        micButton.disabled = false;
        micText.textContent = '🎤 PRESIONA PARA HABLAR';
    }
}

// ==========================================
// MENSAJES EN EL CHAT
// ==========================================
function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `
        <div class="message-content">
            <span class="message-label">Tú</span>
            ${escapeHtml(text)}
        </div>`;
    chatContainer.appendChild(div);
    scrollChat();
}

function addTutorMessage(english, spanish) {
    const div = document.createElement('div');
    div.className = 'message tutor';
    div.innerHTML = `
        <div class="message-content">
            <span class="message-label">🎓 Tutor</span>
            ${escapeHtml(english)}
            ${spanish ? `<div class="message-translation">📚 ${escapeHtml(spanish)}</div>` : ''}
        </div>`;
    chatContainer.appendChild(div);
    scrollChat();
}

function addCorrectionMessage(correction) {
    const div = document.createElement('div');
    div.className = 'message correction';
    div.innerHTML = `
        <div class="message-content">
            <span class="message-label">✏️ Corrección</span>
            ${escapeHtml(correction)}
        </div>`;
    chatContainer.appendChild(div);
    scrollChat();
}

function addWordNotif(word) {
    const div = document.createElement('div');
    div.className = 'message word-notif';
    div.innerHTML = `
        <div class="message-content">
            <span class="message-label">💬 Palabra para practicar</span>
            ¿Cómo se dice <strong>"${escapeHtml(word.es)}"</strong> en inglés?
            <div class="message-translation">💡 Contexto: ${escapeHtml(word.contexto)}</div>
            <button class="reveal-btn" onclick="revealWord(this, '${escapeHtml(word.en)}')">Ver respuesta</button>
        </div>`;
    chatContainer.appendChild(div);
    scrollChat();
}

function revealWord(btn, answer) {
    btn.parentElement.innerHTML += `<div class="revealed">✅ <strong>${answer}</strong></div>`;
    btn.remove();
}

// ==========================================
// SUGERENCIAS (respuestas al tutor)
// ==========================================
function displaySuggestions(suggestions) {
    suggestionsGrid.innerHTML = '';
    suggestionsContainer.style.display = 'block';

    suggestions.forEach(suggestion => {
        const parts = suggestion.split('|');
        const english = parts[0].replace(/^\d+\.\s*/, '').trim();
        const spanish = parts[1] ? parts[1].trim() : '';

        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.onclick = () => sendMessage(english);
        card.innerHTML = `
            <div class="suggestion-english">${escapeHtml(english)}</div>
            ${spanish ? `<div class="suggestion-spanish">${escapeHtml(spanish)}</div>` : ''}
        `;
        suggestionsGrid.appendChild(card);
    });
}

function hideSuggestions() {
    suggestionsContainer.style.display = 'none';
    suggestionsGrid.innerHTML = '';
}

// ==========================================
// NOTIFICACIONES DE PALABRAS
// ==========================================
async function showWordNotification() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/palabra-del-dia`);
        const word = await response.json();
        addWordNotif(word);
    } catch (e) {
        console.error('Error cargando palabra:', e);
    }
}

function startWordNotifications(intervalMinutes = 3) {
    // Primera palabra a los 2 minutos de inactividad
    if (wordNotifInterval) clearInterval(wordNotifInterval);
    wordNotifInterval = setInterval(showWordNotification, intervalMinutes * 60 * 1000);
}

// ==========================================
// CONTROLES DEL BOTÓN
// ==========================================
micButton.addEventListener('click', () => {
    if (!recognition) return;
    if (isListening) {
        recognition.stop();
    } else if (!isProcessing) {
        recognition.start();
    }
});

// Permitir escribir también (tecla Enter en un input oculto activable)
document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        micButton.click();
    }
});

// ==========================================
// BOTÓN RESET
// ==========================================
document.getElementById('resetBtn')?.addEventListener('click', async () => {
    try {
        await fetch(`${CONFIG.API_URL}/api/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
    } catch (e) {}
    sessionId = 'session_' + Date.now();
    chatContainer.innerHTML = '';
    hideSuggestions();
    addTutorMessage(
        "Hello! I'm your English tutor. Let's start fresh! Tell me, how are you today?",
        "¡Hola! Soy tu tutor de inglés. ¡Empecemos de nuevo! Cuéntame, ¿cómo estás hoy?"
    );
    status.textContent = '🎤 Presiona para hablar';
});

// ==========================================
// UTILIDADES
// ==========================================
function scrollChat() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// INICIALIZAR
// ==========================================
async function init() {
    initRecognition();
    const connected = await checkConnection();
    if (connected) {
        startWordNotifications(3); // Palabra cada 3 minutos
        setInterval(checkConnection, 60000); // Re-chequear conexión cada 1 minuto
    } else {
        // Reintentar conexión cada 15 segundos si falla (Render cold start)
        const retryInterval = setInterval(async () => {
            const ok = await checkConnection();
            if (ok) {
                clearInterval(retryInterval);
                startWordNotifications(3);
            }
        }, 15000);
    }
}

init();
