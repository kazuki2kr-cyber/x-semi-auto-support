import { NextResponse } from "next/server";
import { dbRequest } from "@/lib/firebase-admin";
import { ReplyDocument } from "@/types";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { originalTweetUrl, originalText, authorName, likeCount, repostCount, replyCount, viewCount, quotedText, tweetCreatedAt } = body;

        if (!originalTweetUrl || !originalText) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Check for duplicates using Admin SDK
        const snapshot = await dbRequest
            .collection("replies")
            .where("originalTweetUrl", "==", originalTweetUrl)
            .get();

        if (!snapshot.empty) {
            // Logic Change: If exists, delete the old one to allow re-creation.
            // This ensures the Cloud Function (onDocumentCreated) triggers again with fresh data.
            const oldDoc = snapshot.docs[0];
            await oldDoc.ref.delete();
        }

        // Safe Date Parsing
        let tweetDate = new Date();
        if (tweetCreatedAt) {
            const parsed = new Date(tweetCreatedAt);
            if (!isNaN(parsed.getTime())) {
                tweetDate = parsed;
            } else {
                console.warn("Invalid tweetCreatedAt received:", tweetCreatedAt, "falling back to now.");
            }
        }

        // Calculate Score immediately for instant UI feedback
        // Formula: Score = min(100, (L + 3R + 5C + V/100) * 10 / (T + 10))
        const now = new Date();
        const diffMs = now.getTime() - tweetDate.getTime();
        const minutesElapsed = Math.max(0, Math.floor(diffMs / 60000));

        const l = likeCount || 0;
        const r = repostCount || 0;
        const c = replyCount || 0;
        const v = viewCount || 0;

        const numerator = (l + 3 * r + 5 * c + (v / 100)) * 10;
        const denominator = minutesElapsed + 10;

        let score = Math.floor(numerator / denominator);

        // Force score to 0 if older than 120 minutes (2 hours)
        if (minutesElapsed > 120) {
            score = 0;
        }

        // instant rejection if low score
        const initialStatus = score < 60 ? "rejected" : "pending";

        const newDoc: Partial<ReplyDocument> = {
            originalTweetUrl,
            originalText,
            likeCount: l,
            repostCount: r,
            replyCount: c,
            views: v,
            quotedText: quotedText || "",
            score: score,
            topic: "SaaS", // Placeholder, user requested to hide this anyway
            status: initialStatus,
            tweetCreatedAt: tweetDate,
            createdAt: new Date(),
            updatedAt: new Date(),
            suggestions: []
        };

        const docRef = await dbRequest.collection("replies").add(newDoc);

        return NextResponse.json({ message: "Created", id: docRef.id }, { status: 201 });
    } catch (error) {
        console.error("Error creating reply doc:", error);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}
