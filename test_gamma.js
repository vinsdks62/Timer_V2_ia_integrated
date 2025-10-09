require('dotenv').config();

const GAMMA_API_KEY = 'sk-gamma-wU4oeff8ucVldlriOZI0PDvd8NbxpmKqi5RUwYlyvrU';

async function testGamma() {
    const url = 'https://public-api.gamma.app/v0.2/generations';
    
    const payload = {
        inputText: `# Test Simple

Ceci est un test de l'API Gamma.

## Section 1
Contenu test.

## Section 2
Autre contenu.`,
        textMode: 'preserve',
        format: 'document'
    };
    
    console.log('🔑 Test avec clé:', GAMMA_API_KEY.substring(0, 15) + '...');
    console.log('📤 Envoi requête...');
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': GAMMA_API_KEY
            },
            body: JSON.stringify(payload)
        });
        
        console.log('📥 Status:', response.status);
        const text = await response.text();
        console.log('📥 Réponse complète:', text);
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    }
}

testGamma();
