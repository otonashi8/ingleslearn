from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from gtts import gTTS
import base64
import io
import os
import random
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
CORS(app)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Vocabulario para notificaciones/quiz
vocabulary_words = [
    {"es": "gobierno", "en": "government", "contexto": "El nuevo gobierno anunció cambios."},
    {"es": "trabajo", "en": "job / work", "contexto": "Busco un nuevo trabajo."},
    {"es": "amigo", "en": "friend", "contexto": "Mi amigo vive cerca."},
    {"es": "comida", "en": "food", "contexto": "La comida está deliciosa."},
    {"es": "agua", "en": "water", "contexto": "Necesito beber agua."},
    {"es": "tiempo", "en": "time / weather", "contexto": "No tengo tiempo. / El tiempo está nublado."},
    {"es": "casa", "en": "house / home", "contexto": "Me voy a casa."},
    {"es": "ciudad", "en": "city", "contexto": "Vivo en una ciudad grande."},
    {"es": "persona", "en": "person / people", "contexto": "Esa persona es muy amable."},
    {"es": "dinero", "en": "money", "contexto": "No tengo suficiente dinero."},
    {"es": "año", "en": "year", "contexto": "Este año fue difícil."},
    {"es": "semana", "en": "week", "contexto": "La semana pasada fui al cine."},
    {"es": "noche", "en": "night", "contexto": "Buenas noches."},
    {"es": "mañana", "en": "morning / tomorrow", "contexto": "Nos vemos mañana por la mañana."},
    {"es": "problema", "en": "problem", "contexto": "Tengo un problema con mi computadora."},
    {"es": "pregunta", "en": "question", "contexto": "Tengo una pregunta importante."},
    {"es": "respuesta", "en": "answer", "contexto": "No sé la respuesta."},
    {"es": "aprender", "en": "to learn", "contexto": "Quiero aprender inglés."},
    {"es": "hablar", "en": "to speak / to talk", "contexto": "Necesito hablar contigo."},
    {"es": "entender", "en": "to understand", "contexto": "No entiendo esta palabra."},
    {"es": "viaje", "en": "trip / travel", "contexto": "Hice un viaje a la playa."},
    {"es": "película", "en": "movie / film", "contexto": "Vi una buena película anoche."},
    {"es": "música", "en": "music", "contexto": "Me gusta mucho la música."},
    {"es": "familia", "en": "family", "contexto": "Mi familia es muy unida."},
    {"es": "feliz", "en": "happy", "contexto": "Estoy muy feliz hoy."},
    {"es": "cansado", "en": "tired", "contexto": "Estoy muy cansado."},
    {"es": "hambre", "en": "hungry", "contexto": "Tengo mucha hambre."},
    {"es": "ayuda", "en": "help", "contexto": "Necesito ayuda."},
    {"es": "gracias", "en": "thank you", "contexto": "Muchas gracias por todo."},
    {"es": "perdón", "en": "sorry / excuse me", "contexto": "Perdón, ¿puedes repetir?"},
]

SYSTEM_PROMPT = """You are a friendly English tutor helping a Spanish speaker practice conversational English.

ALWAYS respond using EXACTLY this format, with these exact tags:

[ENGLISH]
Your conversational response in English here. Be warm and encouraging.

[CORRECTION]
NONE

[SPANISH]
Spanish translation of your English response.

[SUGGESTIONS]
1. Short natural reply the user could say | Traducción en español
2. Short natural reply the user could say | Traducción en español
3. Short natural reply the user could say | Traducción en español
4. Short natural reply the user could say | Traducción en español

IMPORTANT RULES:
- If the user made a grammar mistake, replace NONE in [CORRECTION] with: You said: "wrong phrase" → Better: "correct phrase" - brief tip
- Suggestions must be things the USER could say as a REPLY to YOUR message (not new questions TO you)
- Keep it simple, friendly, beginner-friendly
- Topics: daily life, hobbies, food, travel, work, feelings
"""

# Historial de conversaciones por sesión
conversation_history = {}

@app.route('/')
def home():
    return "EnglishLearn API is running! 🎓"

@app.route('/api/hablar', methods=['POST'])
def hablar():
    data = request.json
    user_text = data.get('text', '')
    session_id = data.get('session_id', 'default')

    if not user_text:
        return jsonify({'error': 'No text provided'}), 400

    # Inicializar historial de sesión
    if session_id not in conversation_history:
        conversation_history[session_id] = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

    history = conversation_history[session_id]
    history.append({"role": "user", "content": user_text})

    # Limitar historial a 20 mensajes para no gastar tokens
    if len(history) > 21:
        history = [history[0]] + history[-20:]
        conversation_history[session_id] = history

    try:
        completion = client.chat.completions.create(
            messages=history,
            model="llama-3.1-8b-instant",  # modelo confiable
            temperature=0.7,
            max_tokens=600
        )
        response_text = completion.choices[0].message.content

        # Guardar respuesta en historial
        history.append({"role": "assistant", "content": response_text})

        # Parsear la respuesta por secciones
        english = ""
        correction = ""
        spanish = ""
        suggestions = []

        # Extraer [ENGLISH]
        if "[ENGLISH]" in response_text:
            after = response_text.split("[ENGLISH]", 1)[1]

            if "[CORRECTION]" in after:
                english = after.split("[CORRECTION]", 1)[0].strip()
                after2 = after.split("[CORRECTION]", 1)[1]

                if "[SPANISH]" in after2:
                    corr_raw = after2.split("[SPANISH]", 1)[0].strip()
                    correction = "" if corr_raw.upper() == "NONE" else corr_raw
                    after3 = after2.split("[SPANISH]", 1)[1]

                    if "[SUGGESTIONS]" in after3:
                        spanish = after3.split("[SUGGESTIONS]", 1)[0].strip()
                        sugg_text = after3.split("[SUGGESTIONS]", 1)[1].strip()
                        for line in sugg_text.split('\n'):
                            line = line.strip()
                            if line and len(line) > 3:
                                suggestions.append(line)
                    else:
                        spanish = after3.strip()
                else:
                    # Sin [SPANISH], usar lo que hay
                    english = after.strip()
            else:
                # Sin [CORRECTION], parseo simple
                if "[SPANISH]" in after:
                    english = after.split("[SPANISH]", 1)[0].strip()
                    after3 = after.split("[SPANISH]", 1)[1]
                    if "[SUGGESTIONS]" in after3:
                        spanish = after3.split("[SUGGESTIONS]", 1)[0].strip()
                        sugg_text = after3.split("[SUGGESTIONS]", 1)[1].strip()
                        for line in sugg_text.split('\n'):
                            line = line.strip()
                            if line and len(line) > 3:
                                suggestions.append(line)
                    else:
                        spanish = after3.strip()
                else:
                    english = after.strip()
        else:
            # Si el modelo no siguió el formato, usar respuesta completa
            english = response_text.strip()

        # Generar audio del texto en inglés
        audio_base64 = ""
        if english:
            try:
                mp3 = io.BytesIO()
                tts = gTTS(text=english, lang='en', tld='com')
                tts.write_to_fp(mp3)
                mp3.seek(0)
                audio_base64 = base64.b64encode(mp3.read()).decode()
            except Exception as audio_err:
                print(f"Audio error: {audio_err}")

        return jsonify({
            'english': english,
            'correction': correction,
            'spanish': spanish,
            'suggestions': suggestions[:4],
            'audio': audio_base64
        })

    except Exception as e:
        print(f"Error en /api/hablar: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/palabra-del-dia', methods=['GET'])
def palabra_del_dia():
    word = random.choice(vocabulary_words)
    return jsonify(word)


@app.route('/api/reset', methods=['POST'])
def reset_session():
    data = request.json or {}
    session_id = data.get('session_id', 'default')
    if session_id in conversation_history:
        del conversation_history[session_id]
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 5000)))
