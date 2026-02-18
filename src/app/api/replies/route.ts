import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; // Using client SDK for simplicity, or admin in real prod if needed
import { collection, addDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { ReplyDocument } from "@/types";

// Note: In a real production environment, you might want to use firebase-admin
// for the API route to bypass client-side auth rules, or ensure the request is authenticated.
// For this setup, we assume the extension calls this (maybe with a secret header or open for now).

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { originalTweetUrl, originalText, authorName, likeCount, repostCount, replyCount } = body;

        if (!originalTweetUrl || !originalText) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Check for duplicates
        const q = query(collection(db, "replies"), where("originalTweetUrl", "==", originalTweetUrl));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            return NextResponse.json({ message: "Already exists", id: snapshot.docs[0].id }, { status: 200 });
        }

        const newDoc: Partial<ReplyDocument> = {
            originalTweetUrl,
            originalText,
            authorName: authorName || "Unknown",
            likeCount: likeCount || 0,
            repostCount: repostCount || 0,
            replyCount: replyCount || 0,
            score: 0, // Will be calculated by Cloud Function
            topic: "SaaS", // Default or calculated by CF
            status: "pending",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            suggestions: []
        };

        // @ts-ignore - serverTimestamp type mismatch with client SDK types sometimes
        const docRef = await addDoc(collection(db, "replies"), newDoc);

        return NextResponse.json({ message: "Created", id: docRef.id }, { status: 201 });
    } catch (error) {
        console.error("Error creating reply doc:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
