"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, deleteDoc } from "firebase/firestore";
import { ReplyDocument } from "@/types";

// Sub-component for individual reply cards to manage edit state
function ReplyCard({ reply, onDelete }: { reply: ReplyDocument; onDelete: (id: string) => void }) {
  const [editedSuggestions, setEditedSuggestions] = useState<string[]>(reply.suggestions || []);

  const handleSuggestionChange = (index: number, val: string) => {
    const newSug = [...editedSuggestions];
    newSug[index] = val;
    setEditedSuggestions(newSug);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Optional: Add toast or visual feedback
      alert("Copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  const handleReplyClick = async (suggestion: string) => {
    // 1. Open Twitter Web Intent
    const tweetIdMatch = reply.originalTweetUrl.match(/status\/(\d+)/);
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
      const ref = doc(db, "replies", reply.id);
      await updateDoc(ref, {
        status: "posted",
        postedAt: new Date(),
      });
    } catch (e) {
      console.error("Error updating status", e);
    }
  };

  const formatNumber = (num?: number) => {
    if (num === undefined) return "-";
    return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);
  };

  const getMinutesElapsed = () => {
    if (!reply.tweetCreatedAt) return "-";
    try {
      // Identify if it's a Timestamp or Date or string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const date = (reply.tweetCreatedAt as any).toDate ? (reply.tweetCreatedAt as any).toDate() : new Date(reply.tweetCreatedAt);
      const diff = (new Date()).getTime() - date.getTime();
      return Math.floor(diff / 60000) + "m";
    } catch {
      return "-";
    }
  };

  return (
    <div className={`bg-white shadow rounded-lg p-6 border ${reply.status === 'error' ? 'border-red-500 bg-red-50' : 'border-gray-200'} relative`}>
      <button
        onClick={() => onDelete(reply.id)}
        className="absolute top-4 right-4 text-gray-400 hover:text-red-500 p-2"
        title="Delete"
      >
        🗑️
      </button>

      {/* Metrics Header */}
      <div className="mb-4 pr-10">
        <div className="text-sm text-gray-500 flex flex-wrap gap-4 items-center mb-2">
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

          {/* Metrics */}
          <div className="flex gap-4 text-xs font-medium text-gray-600 bg-gray-50 px-3 py-2 rounded">
            <span title="Views">Views: {formatNumber(reply.views)}</span>
            <span title="Likes">Likes: {formatNumber(reply.likeCount)}</span>
            <span title="Reposts">Reposts: {formatNumber(reply.repostCount)}</span>
            <span title="Replies">Replies: {formatNumber(reply.replyCount)}</span>
            <span title="Elapsed Time">Elapsed: {getMinutesElapsed()}</span>
          </div>

          {/* Model Info */}
          {(reply.usedModel || reply.usedKeyIndex) && (
            <span className="text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-100 hidden sm:inline-block">
              {reply.usedModel} {reply.usedKeyIndex ? `(Key #${reply.usedKeyIndex})` : ''}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {reply.quotedText && (
            <div className="text-sm text-gray-500 border-l-4 border-gray-300 pl-3 py-1 bg-gray-50 italic">
              {reply.quotedText}
            </div>
          )}
          <p className="text-gray-800 font-medium whitespace-pre-wrap">{reply.originalText}</p>
        </div>

        <div className="mt-1 text-right">
          <a href={reply.originalTweetUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
            View on X (Source)
          </a>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider border-b pb-1">
          {reply.status === "rejected" ? "Low Score" :
            reply.status === "error" ? "Generation Failed" :
              reply.status === "pending" ? "Analyzing..." : "Reply Suggestions"}
        </h3>

        {reply.status === "rejected" && (
          <div className="p-4 bg-gray-100 rounded text-gray-500 text-sm">
            Score ({reply.score}) did not meet the threshold.
          </div>
        )}

        {reply.status === "error" && (
          <div className="p-4 bg-red-100 rounded text-red-700 text-sm border border-red-200">
            <strong>Error:</strong> {reply.errorMessage || "Unknown error."}
          </div>
        )}

        {/* Suggestion Types Labeling for Clarity */}
        {editedSuggestions.length > 0 && (
          <div className="grid gap-4">
            {editedSuggestions.map((suggestion, idx) => {
              let label = "Option " + (idx + 1);
              if (editedSuggestions.length === 3) {
                if (idx === 0) label = "Agree (共感)";
                if (idx === 1) label = "Question (問いかけ)";
                if (idx === 2) label = "Witty (ユーモア)";
              }

              return (
                <div key={idx} className="bg-gray-50 p-3 rounded border">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
                    <span className="text-xs text-gray-400">{suggestion.length} chars</span>
                  </div>
                  <textarea
                    className="w-full p-2 border rounded text-gray-800 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-y min-h-[80px]"
                    value={suggestion}
                    onChange={(e) => handleSuggestionChange(idx, e.target.value)}
                  />
                  <div className="flex gap-2 mt-2 justify-end">
                    <button
                      onClick={() => handleCopy(suggestion)}
                      className="text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1 rounded text-xs font-medium transition-colors"
                    >
                      📋 Copy
                    </button>
                    <button
                      onClick={() => handleReplyClick(suggestion)}
                      className="bg-blue-500 text-white px-4 py-1.5 rounded shadow hover:bg-blue-600 text-xs font-bold transition-colors"
                    >
                      🚀 Reply
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

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
    try {
      await deleteDoc(doc(db, "replies", id));
    } catch (e) {
      console.error("Error deleting document", e);
    }
  };

  if (loading) return <div className="p-10">Loading...</div>;

  const ALLOWED_EMAIL = "kazuki2kr@gmail.com";

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
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Spark Dashboard</h1>
            <p className="text-sm text-gray-500">Manage and send AI-generated replies</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm bg-white px-3 py-1 rounded-full border shadow-sm">{user.email}</span>
            <button onClick={handleSignOut} className="text-red-500 hover:text-red-700 text-sm font-semibold">Sign Out</button>
          </div>
        </div>

        <div className="grid gap-6">
          {replies.length === 0 && (
            <div className="text-center py-20 bg-white rounded-lg border border-dashed border-gray-300">
              <p className="text-gray-500 text-lg">No pending tasks.</p>
              <p className="text-sm text-gray-400 mt-2">Use the &quot;Scan Top 3&quot; button on X to add items.</p>
            </div>
          )}
          {replies.map((reply) => (
            <ReplyCard key={`${reply.id}-${reply.status}`} reply={reply} onDelete={handleDelete} />
          ))}
        </div>
      </div>
    </div>
  );
}
