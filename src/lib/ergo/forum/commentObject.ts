export interface Comment {
    id: string; // Box ID of the comment.
    discussion: string;  // Discussion ID  (any invented ID, in case of Bounty or Bene, is the project ID)
    authorProfileTokenId: string; // Reputation proof token ID (profile ID)
    text: string;
    timestamp: number;  // Timestamp of the height of the box.
    isSpam: boolean;
    replies: Comment[];
    tx: string|null;
    posting: boolean;
    sentiment: boolean;
}

/**
 * Returns the base sentiment value of a comment.
 * +1 for positive (true)
 * -1 for negative (false)
 * 0 if it's spam (which nullifies the score of that branch)
 */
function getSentimentValue(comment: Comment): number {
    if (comment.isSpam) {
        return 0;
    }
    return comment.sentiment ? 1 : -1;
}

/**
 * Calculates the score of a comment based on your specific rules.
 *
 * The score of a comment 'C' is the sum of the "contributions"
 * from each of its replies 'R'.
 *
 * - If 'R' has no replies (it's a leaf node, N2): Its contribution is V(R).
 * - If 'R' has replies (it's a branch, N1): Its contribution is V(R) + Score(R)
 * or V(R) - Score(R), depending on the sentiment of R.
 */
export function getScore(comment: Comment): number {
    let totalScore = 0;

    // We iterate over all direct replies (R) of the comment (C)
    for (const reply of comment.replies) {
        
        const replyValue = getSentimentValue(reply);

        // If the reply is spam, it contributes nothing and we stop.
        if (replyValue === 0) {
            continue;
        }

        // CASE 1: The 'reply' (R) does NOT have its own replies.
        // (e.g., 'reply' is N2, and 'comment' is N1)
        // Its contribution to the score of 'comment' is
        // simply its value.
        if (reply.replies.length === 0) {
            totalScore += replyValue;
        }
        
        // CASE 2: The 'reply' (R) DOES have replies.
        // (e.g., 'reply' is N1, and 'comment' is N0)
        else {
            // 1. We recursively calculate the score of the reply.
            //    (We call getScore(N1), which will calculate the sum of V(N2))
            const replyScore = getScore(reply);

            // 2. We apply your special logic based on the sentiment of 'reply' (N1)
            if (replyValue === 1) { // If N1 is Positive
                totalScore += replyValue + replyScore;
            } 
            else if (replyValue === -1) { // If N1 is Negative
                totalScore += replyValue - replyScore;
            }
            // (If replyValue is 0 (spam), we already skipped it above)
        }
    }

    return totalScore;
}
