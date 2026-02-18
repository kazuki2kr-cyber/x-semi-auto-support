const https = require('https');

async function main() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("Error: GEMINI_API_KEY environment variable is not set.");
        return;
    }

    console.log("Checking API Key: " + key.substring(0, 8) + "...");

    // 1. Direct API Model List check
    // This bypasses the SDK and checks exactly what models are available to this KEY
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    console.log("\n--- Listing Available Models (Raw API) ---");

    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.error) {
                    console.error("API Error:", JSON.stringify(json.error, null, 2));
                    console.error("\nDiagnosis:");
                    if (json.error.code === 400 && json.error.status === 'INVALID_ARGUMENT') {
                        console.error("-> The API Key is invalid or copied incorrectly.");
                    } else if (json.error.code === 403) {
                        console.error("-> The API Key is valid but lacks permission. Did you enable 'Generative Language API'?");
                    } else {
                        console.error("-> Unknown API error.");
                    }
                } else if (json.models) {
                    console.log(`Success! Found ${json.models.length} models.`);
                    console.log("Available models:");
                    json.models.forEach(m => {
                        if (m.name.includes("gemini")) {
                            console.log(` - ${m.name} (${m.supportedGenerationMethods.join(', ')})`);
                        }
                    });

                    // Check specifically for gemini-1.5-flash
                    const flash = json.models.find(m => m.name.endsWith('gemini-1.5-flash'));
                    if (flash) {
                        console.log("\n-> 'gemini-1.5-flash' is AVAILABLE! The SDK should work.");
                    } else {
                        console.error("\n-> 'gemini-1.5-flash' is MISSING. This is the problem.");
                        console.log("   Please use one of the available model names in your code.");
                    }
                } else {
                    console.log("Response:", data);
                }
            } catch (e) {
                console.error("Failed to parse JSON:", e.message);
                console.log("Raw Response:", data);
            }
        });
    }).on('error', (e) => {
        console.error("Network Error:", e.message);
    });
}

main();
