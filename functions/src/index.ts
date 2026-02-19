import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ReplyDocument, Topic } from "./types";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();

const apiKey = defineSecret("GEMINI_API_KEY");

import { SYSTEM_PROMPT_TEMPLATE, KNOWLEDGE_BASE } from "./knowledge";
import { PSYCHOLOGY_CONTEXT } from "./psychology";

const SYSTEM_PROMPT = SYSTEM_PROMPT_TEMPLATE;

// (Optional) Function to inject specific knowledge if needed
const getKnowledgeContext = () => {
  let context = "";

  if (KNOWLEDGE_BASE.length > 0) {
    context += "\n\n【参照可能な知識ソース】\n" + KNOWLEDGE_BASE.map((k: { title: any; content: any; }) => `Title: ${k.title}\nContent: ${k.content}`).join("\n\n");
  }

  context += "\n\n" + PSYCHOLOGY_CONTEXT;

  return context;
};


// ANALYSIS_PROMPT removed (using combined prompt and local scoring)

export const generateReplySuggestions = onDocumentCreated(
  {
    document: "replies/{docId}",
    secrets: [apiKey],
    region: "asia-northeast1",
    timeoutSeconds: 300, // Increased to 5 minutes
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }

    const data = snapshot.data() as ReplyDocument;
    if (data.status !== "pending") {
      return;
    }

    try {
      functions.logger.info("Function triggered for doc:", event.params.docId);

      const key = apiKey.value();
      if (!key) {
        functions.logger.error("GEMINI_API_KEY is missing or empty.");
        return;
      }

      // --- 1. Calculate Engagement Score (Local / Zero-API) ---
      // Formula: Score = min(100, (L + 3R + 5C) * 10 / (T + 15))

      const likeCount = data.likeCount || 0;
      const repostCount = data.repostCount || 0;
      const replyCount = data.replyCount || 0;

      // Calculate elapsed minutes (T)
      const now = new Date();
      // Use tweetCreatedAt if available (from scraped data), else fallback to doc creation time
      const postedAt = data.tweetCreatedAt ? (data.tweetCreatedAt as any).toDate() : data.createdAt.toDate();
      const diffMs = now.getTime() - postedAt.getTime();
      const minutesElapsed = Math.max(0, Math.floor(diffMs / 60000)); // Ensure non-negative

      const numerator = (likeCount + 3 * repostCount + 5 * replyCount) * 10;
      const denominator = minutesElapsed + 15;

      const calculatedScore = Math.floor(numerator / denominator);

      functions.logger.info(`Score Calc: (L:${likeCount} + 3*R:${repostCount} + 5*C:${replyCount})*10 / (T:${minutesElapsed}+15) = ${calculatedScore}`);

      // Apply Threshold (200) - Increased to save quota
      if (calculatedScore < 200) {
        functions.logger.info(`Score ${calculatedScore} < 200. Rejecting without API call.`);
        await snapshot.ref.update({
          score: calculatedScore,
          status: "rejected",
          topic: "SaaS", // Default/Placeholder since we skipped AI analysis
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      // --- 2. Generate Content with Fallback Strategy ---
      const keyString = apiKey.value();
      if (!keyString) {
        functions.logger.error("GEMINI_API_KEY is missing.");
        return;
      }

      // Support multiple keys separated by comma
      const keys = keyString.split(",").map(k => k.trim()).filter(k => k);
      const modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash"];

      let generatedText = "";
      let usedModel = "";
      let usedKeyIndex = -1;

      // Prepare Prompt
      const COMBINED_PROMPT = `
${SYSTEM_PROMPT}

${getKnowledgeContext()}

Task:
1. Analyze the Topic of the post (Select one from: 'PoliticsEconomics', 'Stocks', 'Math', 'Education', 'IndieDev', 'SaaS').
2. Generate exactly 2 reply suggestions as per the System Prompt:
   - Suggestion 1: Agreeing/Sympathizing
   - Suggestion 2: Disagreeing/Counter-point/Alternative perspective

Target Post:
${data.originalText}

Output as JSON:
{
  "topic": "TopicString",
  "suggestions": ["Agreeing Reply", "Disagreeing Reply"]
}
`;

      // Loop Priority: Try preferred model with all keys, then fallback model with all keys?
      // Or: Try Key 1 (Model A -> Model B), then Key 2 (Model A -> Model B)?
      // Strategy: Try Model A with Key 1, then Key 2. If all fail, try Model B with Key 1, then Key 2.
      // This prioritizes the "Better Model".

      outerLoop:
      for (const modelName of modelsToTry) {
        for (let i = 0; i < keys.length; i++) {
          const currentKey = keys[i];
          try {
            functions.logger.info(`Attempting generation with model: ${modelName} (Key #${i + 1})`);
            const genAI = new GoogleGenerativeAI(currentKey);
            const model = genAI.getGenerativeModel({
              model: modelName,
              generationConfig: { responseMimeType: "application/json" }
            });

            // Generate
            const result = await model.generateContent(COMBINED_PROMPT);
            const response = await result.response;
            const candidateText = response.text();

            if (candidateText) {
              generatedText = candidateText;
              usedModel = modelName;
              usedKeyIndex = i + 1;
              functions.logger.info(`Success with model: ${modelName} using Key #${i + 1}`);
              break outerLoop; // Success, exit both loops
            }
          } catch (error: any) {
            functions.logger.warn(`Failed with model ${modelName} (Key #${i + 1}):`, error.message);
            // Verify if we exhausted all options
            const isLastModel = modelName === modelsToTry[modelsToTry.length - 1];
            const isLastKey = i === keys.length - 1;

            if (isLastModel && isLastKey) {
              functions.logger.error("All models and keys failed.");
              // Update Firestore with error status so the frontend can detect it
              await snapshot.ref.update({
                status: "error",
                errorMessage: error.message || "Unknown error during generation",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              return; // Stop execution
            }
          }
        }
      }

      // Clean up Markdown code blocks if present
      generatedText = generatedText.replace(/```json/g, "").replace(/```/g, "").trim();

      const json = JSON.parse(generatedText);

      const topic = (json.topic || "SaaS") as Topic;
      const suggestions = json.suggestions || [];

      functions.logger.info(`Final Selection: Model=${usedModel}, KeyIndex=${usedKeyIndex}`);

      await snapshot.ref.update({
        topic: topic,
        suggestions: suggestions,
        score: calculatedScore,
        status: "generated", // Mark as generated
        usedModel: usedModel, // Save for debugging
        usedKeyIndex: usedKeyIndex, // Save which key was used (1 or 2)
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    } catch (error: any) {
      functions.logger.error("Error in generateReplySuggestions:", error);
      if (error.response) {
        functions.logger.error("Error Response:", error.response);
      }
      functions.logger.error("Error Message:", error.message);
      functions.logger.error("Error Status:", error.status);
      functions.logger.error("Error StatusText:", error.statusText);
    }
  }
);
