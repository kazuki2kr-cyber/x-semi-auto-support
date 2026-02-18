export type Topic = 'PoliticsEconomics' | 'Stocks' | 'Math' | 'Education' | 'IndieDev' | 'SaaS';

export type ReplyStatus = 'pending' | 'generated' | 'posted' | 'rejected';

export interface ReplyDocument {
    id: string;
    originalTweetUrl: string;
    originalText: string;
    authorName: string;
    suggestions: string[];
    status: ReplyStatus;
    likeCount: number;
    repostCount: number;
    replyCount: number;
    score: number;
    topic: Topic;
    tweetCreatedAt?: any; // Original Tweet Timestamp
    createdAt: any; // Firestore Timestamp
    updatedAt: any; // Firestore Timestamp
}
