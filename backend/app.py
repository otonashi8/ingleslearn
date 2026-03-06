import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from gtts import gTTS
import base64
import io
import random
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
CORS(app)

# === VERIFICACIÓN DE API KEY (MEJORADO) ===
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    print("🚨 ERROR CRÍTICO: GROQ_API_KEY no está configurada")
    print("💡 Solución: Agrega la variable en Render → Environment → GROQ_API_KEY")
    # No detenemos la app, pero imprimimos error
else:
    print(f"✅ API key de Groq configurada correctamente (termina en ...{api_key[-4:]})")

# Inicializar cliente (solo si hay key, si no, será None)
client = Groq(api_key=api_key) if api_key else None

# Lista de palabras (ampliada)
vocabulary_words = [
    {"es": "gobierno", "en": "government", "contexto": "El nuevo gobierno anunció cambios."},
    {"es": "casa", "en": "house", "contexto": "Vivo en una casa grande."},
    {"es": "perro", "en": "dog", "contexto": "El perro ladra mucho."},
    {"es": "comida", "en": "food", "contexto": "La comida está deliciosa."},
    {"es": "agua", "en": "water", "contexto": "Necesito beber agua."},
    {"es": "trabajo", "en": "work", "contexto": "Voy a mi trabajo todas las mañanas."},
    {"es": "escuela", "en": "school", "contexto": "Los niños van a la escuela."},
    {"es": "amigo", "en": "friend", "contexto": "Mi amigo es muy divertido."},
    {"es": "familia", "en": "family", "contexto": "Mi familia es grande."},
    {"es": "ciudad", "en": "city", "contexto": "La ciudad es muy ruidosa."},
]

# Historial de conversación
conversation_history = [{
    "role": "system",
    "content": """
You are a friendly English tutor for a Spanish speaker. Your responses MUST follow this EXACT format:

[ENGLISH]
Your main response in English here.

[SPANISH]
Traducción al español de tu respuesta.

[SUGGESTIONS]
1. [English suggestion 1] | [Spanish translation 1]
2. [English suggestion 2] | [Spanish translation 2]
3. [English suggestion 3] | [Spanish translation 3]
4. [English suggestion 4] | [Spanish translation 4]

Rules:
- Keep responses simple and clear
- Always provide 4 suggestions
"""
}]

@app.route('/')
def home():
    return "EnglishLearn API is running! 🚀"

@app.route('/api/hablar', methods=['POST'])
def hablar():
    # Verificar que el cliente Groq está disponible
    if not client:
        return jsonify({'error': 'API key de Groq no configurada'}), 500
    
    data = request.json
    user_text = data.get('text', '')
    
    # Mantener historial (limitado para no crecer mucho)
    temp_history = conversation_history.copy()
    temp_history.append({"role": "user", "content": user_text})
    
    if len(temp_history) > 10:
        temp_history = [temp_history[0]] + temp_history[-9:]
    
    try:
        completion = client.chat.completions.create(
            messages=temp_history,
            model="llama-3.1-8b-instant",
            temperature=0.7,
            max_tokens=500
        )
        response = completion.choices[0].message.content
        
        # Parsear respuesta
        english = ""
        spanish = ""
        suggestions = []
        
        if "[ENGLISH]" in response:
            parts = response.split("[ENGLISH]")[1].split("[SPANISH]")
            english = parts[0].strip()
            
            if len(parts) > 1:
                spanish_parts = parts[1].split("[SUGGESTIONS]")
                spanish = spanish_parts[0].strip()
                
                if len(spanish_parts) > 1:
                    suggestions_text = spanish_parts[1].strip()
                    for line in suggestions_text.split('\n'):
                        if line.strip() and (line[0].isdigit() or line.startswith('-')):
                            suggestions.append(line.strip())
        
        # Generar audio
        audio_base64 = ""
        if english:
            mp3 = io.BytesIO()
            tts = gTTS(text=english, lang='en', tld='com')
            tts.write_to_fp(mp3)
            mp3.seek(0)
            audio_base64 = base64.b64encode(mp3.read()).decode()
        
        return jsonify({
            'english': english,
            'spanish': spanish,
            'suggestions': suggestions[:4],
            'audio': audio_base64
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/quiz', methods=['GET'])
def quiz():
    word = random.choice(vocabulary_words)
    return jsonify(word)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
