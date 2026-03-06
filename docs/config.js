// CONFIGURACIÓN - CAMBIA ESTO CUANDO TENGAS TU BACKEND EN RENDER
const CONFIG = {
    API_URL: 'https://ingleslearn-api.onrender.com'
};

// No cambiar esto
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Si no es localhost, asumimos que es producción
    CONFIG.API_URL = `https://${window.location.hostname.replace('frontend', 'api')}`;

}

