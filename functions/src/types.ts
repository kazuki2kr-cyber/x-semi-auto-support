// import * as admin from 'firebase-admin'; // Removed unused import to fix build

export type Topic = 'PoliticsEconomics' | 'Stocks' | 'Math' | 'Education' | 'IndieDev' | 'SaaS';

export type ReplyStatus = 'pending' | 'generated' | 'posted' | 'rejected';

export interface ReplyDocument {
    id: string;
    originalText: string;
    originalTweetUrl: string;
    score: number;
    status: "pending" | "generated" | "posted" | "rejected" | "error";
    replies?: string[];
    topic?: Topic;
    suggestions?: string[];
    usedModel?: string;
    usedKeyIndex?: number;
    errorMessage?: string;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt?: FirebaseFirestore.Timestamp;
    tweetCreatedAt?: FirebaseFirestore.Timestamp;
    likeCount?: number;
    repostCount?: number;
    replyCount?: number;
    views?: number;
    quotedText?: string;
}
