// Elementos del DOM
const micButton = document.getElementById('micButton');
const micText = document.getElementById('micText');
const status = document.getElementById('status');
const chatContainer = document.getElementById('chatContainer');
const suggestionsContainer = document.getElementById('suggestions');
const suggestionsGrid = document.getElementById('suggestionsGrid');
const quizContainer = document.getElementById('quizContainer');
const quizContent = document.getElementById('quizContent');
const connectionStatus = document.getElementById('connectionStatus');

// Variables de estado
let isListening = false;
let recognition = null;
let lastActivity = Date.now();
let conversationHistory = [];

// === VARIABLES DEL QUIZ ===
let quizActive = false;
let currentQuizWord = null;

// Verificar conexión con el backend
async function checkConnection() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/`);
        if (response.ok) {
            connectionStatus.textContent = '✅ Conectado al servidor';
            connectionStatus.className = 'connection-status connected';
            micButton.disabled = false;
            micText.textContent = '🎤 PRESIONA PARA HABLAR';
            status.textContent = '🎤 Listo! Presiona el botón y habla';
            return true;
        }
    } catch (error) {
        connectionStatus.textContent = '❌ Error de conexión con el servidor';
        connectionStatus.className = 'connection-status error';
        micButton.disabled = true;
        micText.textContent = '⏳ Servidor no disponible';
        status.textContent = '❌ No se puede conectar al servidor';
        return false;
    }
}

// Inicializar reconocimiento de voz
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
        isListening = true;
        micButton.classList.add('listening');
        micText.textContent = '🎤 ESCUCHANDO...';
        status.textContent = '🎤 Habla ahora...';
    };
    
    recognition.onend = () => {
        isListening = false;
        micButton.classList.remove('listening');
        micText.textContent = '🎤 PRESIONA PARA HABLAR';
        status.textContent = '🎤 Esperando...';
    };
    
    recognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        addMessage('user', text, '');

        // === VERIFICAR SI ES RESPUESTA AL QUIZ ===
        if (checkQuizAnswer(text)) return;

        status.textContent = '🤔 Pensando...';
        
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/hablar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            
            if (!response.ok) throw new Error('Error en el servidor');
            
            const data = await response.json();
            
            // Mostrar respuesta
            addMessage('tutor', data.english, data.spanish);
            
            // Mostrar sugerencias
            if (data.suggestions && data.suggestions.length > 0) {
                displaySuggestions(data.suggestions);
            }
            
            // Reproducir audio
            if (data.audio) {
                const audio = new Audio('data:audio/mp3;base64,' + data.audio);
                audio.play();
            }
            
            lastActivity = Date.now();
            
        } catch (error) {
            console.error('Error:', error);
            status.textContent = '❌ Error de conexión';
            addMessage('tutor', 'Sorry, I had a connection problem.', 'Lo siento, tuve un problema de conexión.');
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Error:', event.error);
        status.textContent = '❌ Error: ' + event.error;
    };
} else {
    status.textContent = '❌ Tu navegador no soporta reconocimiento de voz';
}

// Evento del botón
micButton.addEventListener('click', () => {
    if (recognition) {
        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    }
});

// Función para añadir mensaje
function addMessage(role, english, spanish) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    let html = `<div class="message-content">${english}`;
    if (spanish) {
        html += `<div class="message-translation">📚 ${spanish}</div>`;
    }
    html += '</div>';
    
    messageDiv.innerHTML = html;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Función para mostrar sugerencias
function displaySuggestions(suggestions) {
    suggestionsGrid.innerHTML = '';
    suggestionsContainer.style.display = 'block';
    
    suggestions.forEach(suggestion => {
        const parts = suggestion.split('|');
        const english = parts[0].replace(/^\d+\.\s*/, '').trim();
        const spanish = parts[1] ? parts[1].trim() : '';
        
        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.onclick = () => {
            addMessage('user', english, '');
            if (recognition) {
                const syntheticEvent = {
                    results: [[{ transcript: english }]]
                };
                recognition.onresult(syntheticEvent);
            }
        };
        
        card.innerHTML = `
            <div class="suggestion-english">${english}</div>
            <div class="suggestion-spanish">${spanish}</div>
        `;
        
        suggestionsGrid.appendChild(card);
    });
}

// === QUIZ DE VOCABULARIO ===
async function checkInactivity() {
    const inactive = (Date.now() - lastActivity) / 1000;

    if (inactive > 300 && !quizActive) { // 300 segundos = 5 minutos
        await startQuiz();
    }
}

async function startQuiz() {
    quizActive = true;

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/quiz`);
        currentQuizWord = await response.json();

        // Mostrar quiz en pantalla
        quizContainer.style.display = 'block';
        quizContent.innerHTML = `
            <p><strong>📝 ¿Cómo se dice en inglés?</strong></p>
            <p style="font-size: 1.5rem; margin: 10px 0;">🇪🇸 <strong>${currentQuizWord.es}</strong></p>
            <p style="opacity: 0.8;">📖 ${currentQuizWord.contexto}</p>
            <p style="margin-top: 10px;">🎤 Presiona el botón y di la palabra en inglés...</p>
        `;

        // Reproducir pregunta por audio
        const audioResponse = await fetch(`${CONFIG.API_URL}/api/hablar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: `Quick vocabulary quiz! How do you say "${currentQuizWord.es}" in English? Here is some context: ${currentQuizWord.contexto}`
            })
        });
        const audioData = await audioResponse.json();
        if (audioData.audio) {
            new Audio('data:audio/mp3;base64,' + audioData.audio).play();
        }

    } catch (error) {
        console.error('Error en quiz:', error);
        quizActive = false;
    }
}

function checkQuizAnswer(userAnswer) {
    if (!quizActive || !currentQuizWord) return false;

    const answer = userAnswer.toLowerCase().trim();
    const correct = currentQuizWord.en.toLowerCase().trim();

    // Ocultar quiz
    quizContainer.style.display = 'none';
    quizActive = false;
    lastActivity = Date.now();

    if (answer.includes(correct) || correct.includes(answer)) {
        addMessage('tutor',
            `✅ Correct! "${currentQuizWord.es}" = "${currentQuizWord.en}". Well done!`,
            `✅ ¡Correcto! "${currentQuizWord.es}" = "${currentQuizWord.en}". ¡Muy bien!`
        );
    } else {
        addMessage('tutor',
            `📚 Good try! "${currentQuizWord.es}" in English is "${currentQuizWord.en}". ${currentQuizWord.contexto}`,
            `📚 ¡Buen intento! "${currentQuizWord.es}" en inglés es "${currentQuizWord.en}".`
        );
    }

    currentQuizWord = null;
    return true;
}

// Inicializar
async function init() {
    const connected = await checkConnection();
    if (connected) {
        // Verificar inactividad cada minuto
        setInterval(checkInactivity, 60000);
        // Verificar conexión cada 30 segundos
        setInterval(checkConnection, 30000);
    }
}

init();
