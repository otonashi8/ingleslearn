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

# Vocabulario expandido para notificaciones/quiz
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

# Sistema de prompt mejorado - tutor que corrige y da sugerencias de RESPUESTA
SYSTEM_PROMPT = """You are an English tutor helping a Spanish speaker practice conversational English. 

Your role:
1. Have a natural conversation in English
2. ALWAYS check if the user made grammar or vocabulary mistakes
3. Give suggestions that are RESPONSES to what you just said, not new questions

STRICT FORMAT - always use exactly this structure:

[ENGLISH]
Your response in English here. Keep it conversational, warm and encouraging.

[CORRECTION]
NONE
(or if there was a mistake, write: ❌ You said: "..." → ✅ Better: "..." — brief explanation)

[SPANISH]
Spanish translation of your English response only.

[SUGGESTIONS]
1. [Natural reply to your message in English] | [Spanish translation]
2. [Natural reply to your message in English] | [Spanish translation]
3. [Natural reply to your message in English] | [Spanish translation]
4. [Natural reply to your message in English] | [Spanish translation]

IMPORTANT RULES:
- Suggestions must be things the USER could say IN RESPONSE to YOUR message
- Keep suggestions at beginner-intermediate level
- If user makes a mistake: correct gently, show the right form, explain simply
- Be encouraging! Learning is hard. Use phrases like "Good try!", "Almost perfect!", "Great job!"
- Start the conversation naturally, ask about their day, interests, etc.
- Topics: daily life, hobbies, work, food, travel, family, feelings
"""

# Historial en memoria (por sesión - se resetea si el servidor reinicia)
conversation_history = {}

@app.route('/')
def home():
    return "EnglishLearn API is running! 🎓"

@app.route('/api/hablar', methods=['POST'])
def hablar():
    data = request.json
    user_text = data.get('text', '')
    session_id = data.get('session_id', 'default')
    
    # Inicializar historial de sesión
    if session_id not in conversation_history:
        conversation_history[session_id] = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    history = conversation_history[session_id]
    history.append({"role": "user", "content": user_text})
    
    # Limitar historial a 20 mensajes (10 turnos)
    if len(history) > 21:
        history = [history[0]] + history[-20:]
        conversation_history[session_id] = history
    
    try:
        completion = client.chat.completions.create(
            messages=history,
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=600
        )
        response = completion.choices[0].message.content
        
        # Guardar respuesta en historial
        history.append({"role": "assistant", "content": response})
        
        # Parsear respuesta
        english = ""
        correction = ""
        spanish = ""
        suggestions = []
        
        if "[ENGLISH]" in response:
            after_english = response.split("[ENGLISH]")[1]
            
            if "[CORRECTION]" in after_english:
                english = after_english.split("[CORRECTION]")[0].strip()
                after_correction = after_english.split("[CORRECTION]")[1]
                
                if "[SPANISH]" in after_correction:
                    correction_raw = after_correction.split("[SPANISH]")[0].strip()
                    correction = "" if correction_raw.upper() == "NONE" else correction_raw
                    after_spanish = after_correction.split("[SPANISH]")[1]
                    
                    if "[SUGGESTIONS]" in after_spanish:
                        spanish = after_spanish.split("[SUGGESTIONS]")[0].strip()
                        suggestions_text = after_spanish.split("[SUGGESTIONS]")[1].strip()
                        for line in suggestions_text.split('\n'):
                            line = line.strip()
                            if line and (line[0].isdigit() or line.startswith('-')):
                                suggestions.append(line.strip())
                    else:
                        spanish = after_spanish.strip()
            else:
                # Fallback si el modelo no sigue el formato exacto
                english = after_english.split("[SPANISH]")[0].strip() if "[SPANISH]" in after_english else after_english.strip()
        
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
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/palabra-del-dia', methods=['GET'])
def palabra_del_dia():
    """Devuelve una palabra aleatoria para notificaciones"""
    word = random.choice(vocabulary_words)
    return jsonify(word)

@app.route('/api/reset', methods=['POST'])
def reset_session():
    """Resetear conversación"""
    data = request.json
    session_id = data.get('session_id', 'default')
    if session_id in conversation_history:
        del conversation_history[session_id]
    return jsonify({'status': 'reset ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 5000)))
