import "server-only";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    try {
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";

        // Check if running locally with service-account.json
        let credential = admin.credential.applicationDefault();
        try {
            const path = require("path");
            const fs = require("fs");
            // Try to find service-account.json in root
            const serviceAccountPath = path.join(process.cwd(), "service-account.json");

            if (fs.existsSync(serviceAccountPath)) {
                const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
                credential = admin.credential.cert(serviceAccount);
                console.log("Loaded service-account.json from:", serviceAccountPath);
            } else {
                console.log("service-account.json not found at:", serviceAccountPath);
            }
        } catch (e) {
            console.warn("Failed to load local service-account.json:", e);
            // Fallback to applicationDefault
        }

        admin.initializeApp({
            credential,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
        console.log("Firebase Admin Initialized with project:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
    } catch (error) {
        console.error("Firebase Admin Initialization Error:", error);
    }
}

export const dbRequest = admin.firestore();
export const authRequest = admin.auth();
