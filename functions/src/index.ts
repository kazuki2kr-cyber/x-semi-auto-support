import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { ReplyDocument, Topic } from "./types";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();

const apiKey = defineSecret("GEMINI_API_KEY");

const SYSTEM_PROMPT = `
あなたは人間。名前は川上大和。35歳男性で海外SaaS事例と先進的な思想を扱う月間100万PVの人気Webメディア「Sparks Station」の敏腕ライターです。
... (PERSONA DEFINITION SAME AS BEFORE) ...
`;

const ANALYSIS_PROMPT = `
Analyze the following X (Twitter) post.

1. Classify the topic into one of: 'PoliticsEconomics', 'Stocks', 'Math', 'Education', 'IndieDev', 'SaaS'.
2. Determine if the content is negative, critical, aggressive, or uncomfortable.
3. Assess the "specialist" quality (0-20 points) based on whether it contains unique insights or field-specific knowledge in the identified topic.

Output as JSON.
`;

export const generateReplySuggestions = onDocumentCreated(
  {
    document: "replies/{docId}",
    secrets: [apiKey],
    region: "asia-northeast1",
    timeoutSeconds: 60,
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
      const genAI = new GoogleGenerativeAI(apiKey.value());
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      // Step 1: Analyze Topic & Score
      const analysisPrompt = \`
\${ANALYSIS_PROMPT}

Post Content:
\${data.originalText}
\`;
      
      const analysisResult = await model.generateContent(analysisPrompt);
      const analysisJson = JSON.parse(analysisResult.response.text());
      
      const topic = analysisJson.topic as Topic;
      const isNegative = analysisJson.isNegative || false;
      const specialistScore = analysisJson.specialistScore || 0;

      // Calculate Engagement Score
      // Formula: Reply(75) + Repost(20) + Like (assume 1 for now or negligible compared to reply/repost)
      // Normalize: Max score 80? usage unclear. Let's use raw weighted sum then verify threshold.
      // Requirement: "Engagement Potential (80pts)"
      // Let's cap Engagement at 80.
      const rawEngagement = (data.replyCount * 75) + (data.repostCount * 20) + (data.likeCount * 1);
      const engagementScore = Math.min(80, rawEngagement / 10); // Arbitrary normalization: assume 800 raw points = max 80

      let totalScore = engagementScore + specialistScore;
      if (isNegative) {
          totalScore = 0;
      }

      await snapshot.ref.update({
          topic: topic,
          score: Math.round(totalScore),
      });

      if (totalScore < 80) {
           functions.logger.info(\`Skipping generation. Score: \${totalScore} for \${event.params.docId}\`);
           return;
      }

      // Step 2: Generate Replies
      const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Text mode for reply
      const replyPrompt = \`
\${SYSTEM_PROMPT}

Target Post:
\${data.originalText}

Topic: \${topic}

Generate 3 reply suggestions separated by "---".
\`;

      const result = await textModel.generateContent(replyPrompt);
      const text = result.response.text();
      const suggestions = text.split("---").map(s => s.trim()).filter(s => s.length > 0).slice(0, 3);

      await snapshot.ref.update({
        suggestions: suggestions,
        status: "generated",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
    } catch (error) {
      functions.logger.error("Error in generateReplySuggestions:", error);
    }
  }
);
