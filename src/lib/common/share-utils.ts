/**
 * Share utilities for generating platform-specific share messages and URLs
 * Supports Twitter, Telegram, and LinkedIn with pre-filled messages and hashtags
 */

export type SharePlatform = 'twitter' | 'telegram' | 'linkedin';

export interface ShareConfig {
    projectName: string;
    projectId: string;
    projectStatus: string;
    description?: string;
    baseUrl?: string;
}

const DEFAULT_BASE_URL = typeof window !== 'undefined' 
    ? window.location.origin 
    : 'https://benefaction.platform';

const STABILITY_NEXUS_ACCOUNT = '@StabilityNexus';

/**
 * Generates a standardized share message with proper formatting
 */
function generateShareMessage(
    projectName: string,
    projectStatus: string,
    description?: string
): string {
    const cleanedDescription = description 
        ? description.substring(0, 100).replace(/[^\w\s\-\.]/g, '').trim() 
        : '';
    
    const message = `Check out "${projectName}" - ${projectStatus} on BenefactionPlatform! 🚀${cleanedDescription ? `\n\n${cleanedDescription}` : ''}\n\nHosted by ${STABILITY_NEXUS_ACCOUNT} #BenefactionPlatform`;
    
    return message;
}

/**
 * Gets the project URL
 */
function getProjectUrl(projectId: string, baseUrl: string = DEFAULT_BASE_URL): string {
    return `${baseUrl}?project=${encodeURIComponent(projectId)}`;
}

/**
 * Generates a Twitter share URL with pre-filled message
 * Twitter Web Intent Documentation: https://twitter.com/intent/tweet
 */
export function getTwitterShareUrl(config: ShareConfig): string {
    const message = generateShareMessage(
        config.projectName,
        config.projectStatus,
        config.description
    );
    
    const projectUrl = getProjectUrl(config.projectId, config.baseUrl);
    const fullMessage = `${message}\n\n${projectUrl}`;
    
    const params = new URLSearchParams({
        text: fullMessage,
        via: STABILITY_NEXUS_ACCOUNT.replace('@', '')
    });
    
    return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/**
 * Generates a Telegram share URL with pre-filled message
 * Uses Telegram's compose message intent with pre-filled text
 * Telegram share documentation: https://core.telegram.org/api/links#message-links
 */
export function getTelegramShareUrl(config: ShareConfig): string {
    const message = generateShareMessage(
        config.projectName,
        config.projectStatus,
        config.description
    );
    
    const projectUrl = getProjectUrl(config.projectId, config.baseUrl);
    
    return `https://t.me/share/url?url=${encodeURIComponent(projectUrl)}&text=${encodeURIComponent(message)}`;
}

/**
 * Generates a LinkedIn share URL with pre-filled message
 * LinkedIn share documentation: https://www.linkedin.com/sharing/share-offsite/
 * Note: LinkedIn's offsite share endpoint doesn't support pre-filled message body.
 * However, we can use LinkedIn's official share plugin parameters and direct users
 * to compose.linkedin.com for better pre-fill support.
 */
export function getLinkedInShareUrl(config: ShareConfig): string {
    const projectUrl = getProjectUrl(config.projectId, config.baseUrl);
    const message = generateShareMessage(
        config.projectName,
        config.projectStatus,
        config.description
    );
    
    // Use LinkedIn's official share endpoint with best available parameters
    // The url parameter is required, title and summary appear in the preview
    const params = new URLSearchParams({
        url: projectUrl,
        title: config.projectName,
        summary: message.substring(0, 300),
        source: 'BenefactionPlatform'
    });
    
    return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`;
}

/**
 * Gets the appropriate share URL based on platform
 */
export function getShareUrl(platform: SharePlatform, config: ShareConfig): string {
    switch (platform) {
        case 'twitter':
            return getTwitterShareUrl(config);
        case 'telegram':
            return getTelegramShareUrl(config);
        case 'linkedin':
            return getLinkedInShareUrl(config);
        default:
            throw new Error(`Unknown share platform: ${platform}`);
    }
}

/**
 * Gets the shareable text for copy-to-clipboard
 */
export function getShareText(config: ShareConfig): string {
    const message = generateShareMessage(
        config.projectName,
        config.projectStatus,
        config.description
    );
    
    const projectUrl = getProjectUrl(config.projectId, config.baseUrl);
    
    return `${message}\n\n${projectUrl}`;
}

/**
 * Opens share URL in a new window
 */
export function openShareUrl(url: string, platform: SharePlatform): void {
    if (typeof window === 'undefined') return;
    
    const width = 600;
    const height = 400;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    
    window.open(
        url,
        `${platform}-share`,
        `width=${width},height=${height},left=${left},top=${top}`
    );
}

/**
 * Copies text to clipboard and returns success status
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            return success;
        }
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
}

/**
 * Gets platform metadata for UI display
 */
export function getPlatformMetadata(platform: SharePlatform) {
    const metadata: Record<SharePlatform, { name: string }> = {
        twitter: { name: 'Twitter (X)' },
        telegram: { name: 'Telegram' },
        linkedin: { name: 'LinkedIn' }
    };
    
    return metadata[platform];
}
