import { writable, get } from 'svelte/store';
import { reputation_proof } from './store';
import { generate_reputation_proof } from './submit';
import { type RPBox } from './object';
import { type Comment } from './commentObject';
import { fetchComments } from './commentFetch';
import {
    COMMENT_TYPE_NFT_ID,
    DISCUSSION_TYPE_NFT_ID,
    PROFILE_TOTAL_SUPPLY,
    PROFILE_TYPE_NFT_ID,
    SPAM_FLAG_NFT_ID
} from './envs';



async function fetchThreadsAPI(projectId: string): Promise<Comment[]> {
    console.log("API: fetchThreads", { projectId });
    return await fetchComments(projectId);
}

export async function createProfileBox(): Promise<string> {
    const profileTxId = await generate_reputation_proof(
        PROFILE_TOTAL_SUPPLY,
        PROFILE_TOTAL_SUPPLY,
        PROFILE_TYPE_NFT_ID,
        undefined,
        true,
        { name: "Anon" },
        false, // The profile box should NOT be locked
        undefined
    );

    if (!profileTxId) {
        throw new Error("Fatal error: The profile creation transaction failed to send.");
    }

    console.warn(
        "User profile not found. A new one has been created. Please wait ~2 minutes for the transaction to confirm and try again."
    );

    return profileTxId;
}

/**
 * Gets the main box (the one with the most tokens) from the 'reputation_proof' store.
 * If the store is empty, it attempts to create the initial profile proof.
 */
async function getOrCreateProfileBox(): Promise<RPBox|null> {
    const proof = get(reputation_proof);
    
    console.log("getOrCreateProfileBox: Current reputation_proof store:", proof);

    // --- Case 1: The profile proof does NOT exist ---
    if (!proof || !proof.current_boxes || proof.current_boxes.length === 0) {
        console.log("No user reputation proof found. User needs to create a profile.");
        console.log("Proof state:", { proof, hasBoxes: proof?.current_boxes?.length });
        return null;

    } else {
        // --- Case 2: The profile proof DOES exist ---
        const mainBox = proof.current_boxes[0];

        if (mainBox.is_locked) {
            throw new Error("Error: Your main profile box is locked (is_locked=true) and cannot be spent.");
        }
        if (mainBox.token_amount < 1) {
            throw new Error("Error: You do not have enough reputation tokens left in your main box to perform this action.");
        }

        console.log(
            "Using existing profile box as input:",
            mainBox.box_id,
            "with profile token:",
            mainBox.token_id
        );
        return mainBox;
    }

}

async function postCommentAPI(projectId: string, text: string, sentiment: boolean): Promise<Comment> {
    console.log("API: postComment", { projectId, text });

    const inputProofBox = await getOrCreateProfileBox();
    
    if (!inputProofBox) {
        throw new Error("Profile not found. Please wait for profile creation to complete and try again.");
    }

    const tx = await generate_reputation_proof(
        1,
        PROFILE_TOTAL_SUPPLY,
        DISCUSSION_TYPE_NFT_ID,
        projectId,
        sentiment,
        text,
        true,
        inputProofBox
    );

    if (!tx) throw new Error("Comment transaction failed.");
    console.log("Comment transaction sent, ID:", tx);

    const newComment: Comment = {
        id: `sim_box_${Math.random().toString(36).substring(2, 10)}`,
        discussion: projectId,
        authorProfileTokenId: inputProofBox.token_id,
        text: text,
        timestamp: Date.now(),
        replies: [],
        isSpam: false,
        tx: tx,
        posting: true,
        sentiment: sentiment
    };
    return newComment;
}

async function replyToCommentAPI(
    parentCommentId: string,
    projectId: string,
    text: string,
    sentiment: boolean
): Promise<Comment> {
    console.log("API: replyToComment", { parentCommentId, projectId, text });

    const inputProofBox = await getOrCreateProfileBox();
    
    if (!inputProofBox) {
        throw new Error("Profile not found. Please wait for profile creation to complete and try again.");
    }

    const tx = await generate_reputation_proof(
        1,
        PROFILE_TOTAL_SUPPLY,
        COMMENT_TYPE_NFT_ID,
        parentCommentId,
        sentiment,
        text,
        true,
        inputProofBox
    );

    if (!tx) throw new Error("Reply transaction failed.");
    console.log("Reply transaction sent, ID:", tx);

    const newReply: Comment = {
        id: `sim_box_${Math.random().toString(36).substring(2, 10)}`,
        discussion: projectId,
        authorProfileTokenId: inputProofBox.token_id,
        text: text,
        timestamp: Date.now(),
        replies: [],
        isSpam: false,
        tx: tx,
        posting: true,
        sentiment: sentiment
    };
    return newReply;
}

async function flagSpamAPI(targetCommentId: string): Promise<{ targetCommentId: string }> {
    console.log("API: flagSpam", { targetCommentId });

    const inputProofBox = await getOrCreateProfileBox();
    
    if (!inputProofBox) {
        throw new Error("Profile not found. Please wait for profile creation to complete and try again.");
    }

    const tx = await generate_reputation_proof(
        1,
        PROFILE_TOTAL_SUPPLY,
        SPAM_FLAG_NFT_ID,
        targetCommentId,
        true,
        null,
        true,
        inputProofBox
    );

    if (!tx) throw new Error("Spam flag transaction failed.");
    console.log("Spam transaction sent, ID:", tx);

    return { targetCommentId };
}

// --- Svelte Store ---

export const threads = writable<Comment[]>([]);
export const isLoading = writable<boolean>(true);
export const error = writable<string | null>(null);
export const currentProjectId = writable<string>(
    "716f6e863f744b9ac22c97ec7b76ea5f5908bc5b2f67c61510bfc4751384ea7a"
);

export async function loadThreads() {
    isLoading.set(true);
    error.set(null);
    let projectId = '';
    currentProjectId.subscribe(id => (projectId = id))();

    try {
        const data = await fetchThreadsAPI(projectId);
        data.sort((a, b) => a.timestamp - b.timestamp);
        threads.set(data);
    } catch (err: any) {
        error.set(err.message || "Error loading comments.");
    } finally {
        isLoading.set(false);
    }
}

export async function postComment(text: string, sentiment: boolean) {
    console.log("Posting comment:", text);
    let projectId = '';
    currentProjectId.subscribe(id => (projectId = id))();

    try {
        const newComment = await postCommentAPI(projectId, text, sentiment);

        threads.update(currentThreadList => {
            return [newComment, ...currentThreadList];
        });
    } catch (err: any) {
        console.error("Error posting comment:", err);
        error.set(err.message || "Error posting comment.");
    }
}

/**
 * Adds a reply to a parent comment at any nesting level.
 */
function addReplyToThread(
    threadsList: Comment[],
    parentId: string,
    newReply: Comment
): Comment[] {
    return threadsList.map(comment => {
        if (comment.id === parentId) {
            return {
                ...comment,
                replies: [newReply, ...(comment.replies || [])]
            };
        }

        if (comment.replies && comment.replies.length > 0) {
            return {
                ...comment,
                replies: addReplyToThread(comment.replies, parentId, newReply)
            };
        }

        return comment;
    });
}

/**
 * Marks a comment as spam at any nesting level.
 */
function flagCommentAsSpam(threadsList: Comment[], targetId: string): Comment[] {
    return threadsList.map(comment => {
        if (comment.id === targetId) {
            return { ...comment, isSpam: true, text: "[Comment marked as spam]" };
        }
        if (comment.replies && comment.replies.length > 0) {
            return { ...comment, replies: flagCommentAsSpam(comment.replies, targetId) };
        }
        return comment;
    });
}


export async function replyToComment(
    parentCommentId: string,
    text: string,
    sentiment: boolean
) {
    console.log("Replying to comment:", parentCommentId, text);
    let projectId = '';
    currentProjectId.subscribe(id => (projectId = id))();

    try {
        const newReply = await replyToCommentAPI(parentCommentId, projectId, text, sentiment);

        threads.update(currentThreadList => {
            return addReplyToThread(currentThreadList, parentCommentId, newReply);
        });
    } catch (err: any) {
        console.error("Error replying:", err);
        error.set(err.message || "Error replying.");
    }
}

export async function flagSpam(targetCommentId: string) {
    console.log("Flagging as spam:", targetCommentId);

    try {
        const { targetCommentId: confirmedId } = await flagSpamAPI(targetCommentId);

        if (confirmedId) {
            threads.update(currentThreadList => {
                return flagCommentAsSpam(currentThreadList, confirmedId);
            });
        }
    } catch (err: any) {
        console.error("Error flagging spam:", err);
        error.set(err.message || "Error flagging spam.");
    }
}
