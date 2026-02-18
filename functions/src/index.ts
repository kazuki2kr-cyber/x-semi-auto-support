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

      // Apply Threshold (60)
      if (calculatedScore < 60) {
        functions.logger.info(`Score ${calculatedScore} < 60. Rejecting without API call.`);
        await snapshot.ref.update({
          score: calculatedScore,
          status: "rejected",
          topic: "SaaS", // Default/Placeholder since we skipped AI analysis
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      // --- 2. Generate Content (1 API Call) ---
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: { responseMimeType: "application/json" }
      });

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

      functions.logger.info("Score passed. Calling Gemini (Combined Mode)...");
      const result = await model.generateContent(COMBINED_PROMPT);
      const response = await result.response;
      const json = JSON.parse(response.text());

      const topic = json.topic as Topic;
      const suggestions = json.suggestions || [];

      await snapshot.ref.update({
        topic: topic,
        score: calculatedScore,
        suggestions: suggestions,
        status: "generated",
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
