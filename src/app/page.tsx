"use strict";
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, deleteDoc } from "firebase/firestore";
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
    // Listen for 'generated' or 'rejected' replies (and 'pending' to see live updates?)
    // Firestore "in" query limits to 10 values.
    const q = query(
      collection(db, "replies"),
      where("status", "in", ["generated", "rejected", "pending", "error"]),
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

  const handleDelete = async (id: string) => {
    // if (!confirm("Are you sure you want to delete this item?")) return; // Removed confirmation
    try {
      await deleteDoc(doc(db, "replies", id));
    } catch (e) {
      console.error("Error deleting document", e);
    }
  };

  const handleReply = async (replyDoc: ReplyDocument, suggestion: string) => {
    // 1. Open Twitter Web Intent
    // Format: https://x.com/intent/post?text={text}&in_reply_to={tweet_id}
    // We need tweet_id. originalTweetUrl might look like https://x.com/user/status/123456789
    // Extract ID from URL
    const tweetIdMatch = replyDoc.originalTweetUrl.match(/status\/(\d+)/);
    const tweetId = tweetIdMatch ? tweetIdMatch[1] : "";

    const text = encodeURIComponent(suggestion);
    const url = "https://x.com/intent/post?text=" + text + "&in_reply_to=" + tweetId;

    const width = 600;
    const height = 400;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    window.open(
      url,
      "twitter-reply",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

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

  // Allowed email (Replace with your actual email or set in .env)
  const ALLOWED_EMAIL = "kazuki2kr@gmail.com"; // detected from your login

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

  if (user.email !== ALLOWED_EMAIL) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <h1 className="text-red-500 text-2xl font-bold mb-4">Access Denied</h1>
        <p className="mb-4">Your email ({user.email}) is not authorized.</p>
        <button onClick={handleSignOut} className="text-blue-500 underline">Sign Out</button>
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
            <div key={reply.id} className={`bg-white shadow rounded-lg p-6 border ${reply.status === 'error' ? 'border-red-500 bg-red-50' : 'border-gray-200'} relative`}>
              <button
                onClick={() => handleDelete(reply.id)}
                className="absolute top-4 right-4 text-gray-400 hover:text-red-500 p-2"
                title="Delete"
              >
                🗑️
              </button>
              <div className="mb-4 pr-10">
                <div className="text-sm text-gray-500 flex justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${reply.score >= 200 ? 'bg-green-100 text-green-800' :
                      reply.score >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                      Score: {reply.score}
                    </span>
                    <span className={`uppercase font-semibold text-xs ${reply.status === 'generated' ? 'text-green-600' :
                      reply.status === 'error' ? 'text-red-600' :
                        reply.status === 'rejected' ? 'text-gray-400' : 'text-blue-500'
                      }`}>
                      {reply.status}
                    </span>
                  </span>

                  {/* Model & Key Info Display */}
                  {(reply.usedModel || reply.usedKeyIndex) && (
                    <span className="text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-100">
                      Model: {reply.usedModel || 'Unknown'} {reply.usedKeyIndex ? `(Key #${reply.usedKeyIndex})` : ''}
                    </span>
                  )}

                  <a href={reply.originalTweetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">View Tweet</a>
                </div>
                <p className="mt-2 text-gray-800 font-medium">{reply.originalText}</p>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  {reply.status === "rejected" ? "Low Score - No Suggestions" :
                    reply.status === "error" ? "Generation Failed" :
                      reply.status === "pending" ? "Analyzing..." : "Suggestions"}
                </h3>

                {reply.status === "rejected" && (
                  <div className="p-4 bg-gray-100 rounded text-gray-500 text-sm">
                    Score ({reply.score}) did not meet the threshold (200).
                  </div>
                )}

                {reply.status === "error" && (
                  <div className="p-4 bg-red-100 rounded text-red-700 text-sm border border-red-200">
                    <strong>Error:</strong> {reply.errorMessage || "Unknown error occurred during generation."}
                  </div>
                )}

                {reply.suggestions && reply.suggestions.map((suggestion, idx) => (
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
