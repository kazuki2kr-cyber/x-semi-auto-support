"use strict";
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy } from "firebase/firestore";
import { ReplyDocument } from "@/types";

export default function Home() {
    const [user, setUser] = useState<User | null>(null);
    const [replies, setReplies] = useState<ReplyDocument[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;

        // Listen for 'generated' replies
        const q = query(
            collection(db, "replies"),
            where("status", "==", "generated"),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as ReplyDocument[];
            setReplies(docs);
        });

        return () => unsubscribe();
    }, [user]);

    const handleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error signing in", error);
        }
    };

    const handleSignOut = async () => {
        await signOut(auth);
    };

    const handleReply = async (replyDoc: ReplyDocument, suggestion: string) => {
        // 1. Open Twitter Web Intent
        // Format: https://x.com/intent/post?text={text}&in_reply_to={tweet_id}
        // We need tweet_id. originalTweetUrl might look like https://x.com/user/status/123456789
        // Extract ID from URL
        const tweetIdMatch = replyDoc.originalTweetUrl.match(/status\/(\d+)/);
        const tweetId = tweetIdMatch ? tweetIdMatch[1] : "";

        const text = encodeURIComponent(suggestion);
        const url = \`https://x.com/intent/post?text=\${text}&in_reply_to=\${tweetId}\`;
    
    window.open(url, "_blank");

    // 2. Update status to posted
    try {
      const ref = doc(db, "replies", replyDoc.id);
      await updateDoc(ref, {
        status: "posted",
        postedAt: new Date(),
      });
    } catch (e) {
      console.error("Error updating status", e);
    }
  };

  if (loading) return <div className="p-10">Loading...</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <h1 className="text-3xl font-bold mb-8">X Semi-Auto Support</h1>
        <button
          onClick={handleSignIn}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <div className="flex items-center gap-4">
                <span>{user.email}</span>
                <button onClick={handleSignOut} className="text-red-500 hover:underline">Sign Out</button>
            </div>
        </div>

        <div className="grid gap-6">
          {replies.length === 0 && (
            <div className="text-center py-10 text-gray-500">No generated replies pending.</div>
          )}
          {replies.map((reply) => (
            <div key={reply.id} className="bg-white shadow rounded-lg p-6 border border-gray-200">
              <div className="mb-4">
                <div className="text-sm text-gray-500 flex justify-between">
                    <span>Topic: {reply.topic} | Score: {reply.score}</span>
                    <a href={reply.originalTweetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">View Tweet</a>
                </div>
                <p className="mt-2 text-gray-800 font-medium">{reply.originalText}</p>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Suggestions</h3>
                {reply.suggestions.map((suggestion, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded border flex justify-between items-start gap-4">
                    <p className="text-gray-700 whitespace-pre-wrap flex-1">{suggestion}</p>
                    <button
                      onClick={() => handleReply(reply, suggestion)}
                      className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 whitespace-nowrap"
                    >
                      Reply
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
