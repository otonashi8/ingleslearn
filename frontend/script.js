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
let quizInterval = null;
let conversationHistory = [];

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

// Verificar inactividad para quiz
async function checkInactivity() {
    const inactive = (Date.now() - lastActivity) / 1000;
    
    if (inactive > 300 && !quizContainer.style.display === 'block') { // 5 minutos
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/quiz`);
            const word = await response.json();
            
            quizContainer.style.display = 'block';
            quizContent.innerHTML = `
                <p><strong>📝 PALABRA: ${word.es}</strong></p>
                <p>📖 ${word.contexto}</p>
                <p>🎤 Presiona el botón y di cómo se dice en inglés...</p>
            `;
            
            // Reproducir pregunta
            const audioResponse = await fetch(`${CONFIG.API_URL}/api/hablar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: `Quick quiz! How do you say ${word.es} in English? ${word.contexto}`
                })
            });
            const audioData = await audioResponse.json();
            if (audioData.audio) {
                new Audio('data:audio/mp3;base64,' + audioData.audio).play();
            }
            
        } catch (error) {
            console.error('Error en quiz:', error);
        }
    }
}

// Inicializar
async function init() {
    const connected = await checkConnection();
    if (connected) {
        // Verificar cada minuto
        setInterval(checkInactivity, 60000);
        // Verificar conexión cada 30 segundos
        setInterval(checkConnection, 30000);
    }
}

init();