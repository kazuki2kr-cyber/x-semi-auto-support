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
    createdAt: any; // Client side returns simpler objects or Timestamp
    updatedAt?: any;
    tweetCreatedAt?: any;
    likeCount?: number;
    repostCount?: number;
    replyCount?: number;
}
