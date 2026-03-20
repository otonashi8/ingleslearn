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

api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    print("ERROR: GROQ_API_KEY no configurada")
else:
    print(f"API key OK (...{api_key[-4:]})")

client = Groq(api_key=api_key) if api_key else None

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
    {"es": "año", "en": "year", "contexto": "Este año fue difícil."},
    {"es": "tiempo", "en": "time / weather", "contexto": "No tengo tiempo."},
    {"es": "feliz", "en": "happy", "contexto": "Estoy muy feliz hoy."},
    {"es": "cansado", "en": "tired", "contexto": "Estoy muy cansado."},
    {"es": "aprender", "en": "to learn", "contexto": "Quiero aprender inglés."},
    {"es": "hablar", "en": "to speak", "contexto": "Necesito hablar contigo."},
    {"es": "viaje", "en": "trip", "contexto": "Hice un viaje a la playa."},
    {"es": "música", "en": "music", "contexto": "Me gusta mucho la música."},
    {"es": "película", "en": "movie", "contexto": "Vi una buena película anoche."},
    {"es": "ayuda", "en": "help", "contexto": "Necesito ayuda."},
]

# Historial global (igual que el original tuyo)
conversation_history = [{
    "role": "system",
    "content": """You are a friendly English tutor for a Spanish speaker. Your responses MUST follow this EXACT format:

[ENGLISH]
Your main response in English here. Be warm and encouraging.

[CORRECTION]
NONE

[SPANISH]
Traduccion al espanol de tu respuesta.

[SUGGESTIONS]
1. [What the user could reply in English] | [Traduccion al espanol]
2. [What the user could reply in English] | [Traduccion al espanol]
3. [What the user could reply in English] | [Traduccion al espanol]
4. [What the user could reply in English] | [Traduccion al espanol]

Rules:
- Keep responses simple and clear
- Always provide 4 suggestions
- Suggestions must be things the USER could say as a REPLY to your message
- If user made a grammar mistake, replace NONE with: You said: "..." Better: "..."
"""
}]

@app.route('/')
def home():
    return "EnglishLearn API is running!"

@app.route('/api/hablar', methods=['POST'])
def hablar():
    if not client:
        return jsonify({'error': 'API key de Groq no configurada'}), 500

    data = request.json
    user_text = data.get('text', '')

    if not user_text:
        return jsonify({'error': 'No text provided'}), 400

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

        english = ""
        correction = ""
        spanish = ""
        suggestions = []

        if "[ENGLISH]" in response:
            after_english = response.split("[ENGLISH]", 1)[1]

            if "[CORRECTION]" in after_english:
                english = after_english.split("[CORRECTION]", 1)[0].strip()
                after_corr = after_english.split("[CORRECTION]", 1)[1]
                if "[SPANISH]" in after_corr:
                    corr_raw = after_corr.split("[SPANISH]", 1)[0].strip()
                    correction = "" if corr_raw.upper() == "NONE" else corr_raw
                    after_spanish = after_corr.split("[SPANISH]", 1)[1]
                else:
                    after_spanish = after_corr
            elif "[SPANISH]" in after_english:
                english = after_english.split("[SPANISH]", 1)[0].strip()
                after_spanish = after_english.split("[SPANISH]", 1)[1]
            else:
                english = after_english.strip()
                after_spanish = ""

            if "[SUGGESTIONS]" in after_spanish:
                spanish = after_spanish.split("[SUGGESTIONS]", 1)[0].strip()
                sugg_text = after_spanish.split("[SUGGESTIONS]", 1)[1].strip()
                for line in sugg_text.split('\n'):
                    line = line.strip()
                    if line and (line[0].isdigit() or line.startswith('-')):
                        suggestions.append(line)
            else:
                spanish = after_spanish.strip()

        # Generar audio
        audio_base64 = ""
        if english:
            try:
                mp3 = io.BytesIO()
                tts = gTTS(text=english, lang='en', tld='com')
                tts.write_to_fp(mp3)
                mp3.seek(0)
                audio_base64 = base64.b64encode(mp3.read()).decode()
            except Exception as e:
                print(f"Audio error: {e}")

        return jsonify({
            'english': english,
            'correction': correction,
            'spanish': spanish,
            'suggestions': suggestions[:4],
            'audio': audio_base64
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/quiz', methods=['GET'])
def quiz():
    word = random.choice(vocabulary_words)
    return jsonify(word)

@app.route('/api/palabra-del-dia', methods=['GET'])
def palabra_del_dia():
    word = random.choice(vocabulary_words)
    return jsonify(word)

@app.route('/api/reset', methods=['POST'])
def reset_session():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
