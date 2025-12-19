<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { Button } from '$lib/components/ui/button';
    import * as Dialog from '$lib/components/ui/dialog';
    import { cn } from '$lib/utils';
    import {
        type SharePlatform,
        type ShareConfig,
        getShareUrl,
        getShareText,
        openShareUrl,
        copyToClipboard,
        getPlatformMetadata
    } from '$lib/common/share-utils';
    import ShareIcon from 'lucide-svelte/icons/share-2';
    import CopyIcon from 'lucide-svelte/icons/copy';
    import CheckIcon from 'lucide-svelte/icons/check';
    import TwitterIcon from 'lucide-svelte/icons/twitter';
    import SendIcon from 'lucide-svelte/icons/send';
    import LinkedinIcon from 'lucide-svelte/icons/linkedin';

    export let open: boolean = false;
    export let projectName: string = '';
    export let projectId: string = '';
    export let projectStatus: string = '';
    export let description: string = '';

    const dispatch = createEventDispatcher();

    let selectedPlatform: SharePlatform | null = null;
    let copyFeedback = false;
    let copyFeedbackTimeout: ReturnType<typeof setTimeout>;
    let isSharing = false;

    const platforms: SharePlatform[] = ['twitter', 'telegram', 'linkedin'];

    $: shareConfig = {
        projectName,
        projectId,
        projectStatus,
        description
    } satisfies ShareConfig;

    function handlePlatformSelect(platform: SharePlatform) {
        selectedPlatform = platform;
    }

    async function handleShare() {
        if (!selectedPlatform) return;

        isSharing = true;
        try {
            const url = getShareUrl(selectedPlatform, shareConfig);
            openShareUrl(url, selectedPlatform);
            
            // Close modal after successful share
            setTimeout(() => {
                open = false;
                selectedPlatform = null;
                isSharing = false;
            }, 500);
        } catch (error) {
            console.error('Share error:', error);
            isSharing = false;
        }
    }

    async function handleCopy() {
        const text = getShareText(shareConfig);
        const success = await copyToClipboard(text);
        
        if (success) {
            copyFeedback = true;
            if (copyFeedbackTimeout) clearTimeout(copyFeedbackTimeout);
            copyFeedbackTimeout = setTimeout(() => {
                copyFeedback = false;
            }, 2000);
        }
    }

    function closeModal() {
        open = false;
        selectedPlatform = null;
        dispatch('close');
    }

    $: if (!open) {
        selectedPlatform = null;
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-[500px]">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2">
                <ShareIcon class="w-5 h-5 text-orange-500" />
                Share "{projectName}"
            </Dialog.Title>
            <Dialog.Description>
                Choose a platform to share this project with your network. A pre-filled message will be ready to post.
            </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 py-4">
            <!-- Platform Selection -->
            <div class="grid grid-cols-3 gap-3">
                {#each platforms as platform}
                    <button
                        on:click={() => handlePlatformSelect(platform)}
                        class={cn(
                            'p-4 rounded-lg border-2 transition-all duration-200',
                            'flex flex-col items-center justify-center gap-2',
                            selectedPlatform === platform
                                ? 'border-orange-500 bg-orange-500/10'
                                : 'border-border hover:border-orange-500/50 bg-muted/30'
                        )}
                    >
                        {#if platform === 'twitter'}
                            <TwitterIcon class="w-6 h-6" />
                            <span class="text-sm font-medium text-center">Twitter (X)</span>
                        {:else if platform === 'telegram'}
                            <SendIcon class="w-6 h-6" />
                            <span class="text-sm font-medium text-center">Telegram</span>
                        {:else if platform === 'linkedin'}
                            <LinkedinIcon class="w-6 h-6" />
                            <span class="text-sm font-medium text-center">LinkedIn</span>
                        {/if}
                    </button>
                {/each}
            </div>

            <!-- Share Preview -->
            <div class="bg-muted/50 p-4 rounded-lg border border-border">
                <p class="text-xs font-semibold text-muted-foreground mb-2 uppercase">Preview Message</p>
                <p class="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    Check out "{projectName}" - {projectStatus} on BenefactionPlatform! 🚀
                </p>
                <p class="text-xs text-muted-foreground mt-2">Hosted by @StabilityNexus #BenefactionPlatform</p>
            </div>

            <!-- Copy to Clipboard Option -->
            <div class="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    on:click={handleCopy}
                    class="w-full gap-2"
                >
                    {#if copyFeedback}
                        <CheckIcon class="w-4 h-4 text-green-500" />
                        <span>Copied!</span>
                    {:else}
                        <CopyIcon class="w-4 h-4" />
                        <span>Copy Message</span>
                    {/if}
                </Button>
            </div>
        </div>

        <Dialog.Footer>
            <Button variant="outline" on:click={closeModal}>
                Cancel
            </Button>
            <Button
                on:click={handleShare}
                disabled={!selectedPlatform || isSharing}
                class="bg-orange-500 hover:bg-orange-600 text-white gap-2"
            >
                {#if isSharing}
                    <span>Opening...</span>
                {:else}
                    <ShareIcon class="w-4 h-4" />
                    <span>Share on {selectedPlatform ? getPlatformMetadata(selectedPlatform).name : 'Platform'}</span>
                {/if}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<style>
    :global(.share-button) {
        transition: all 0.2s ease;
    }
    
    :global(.share-button:hover) {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 152, 0, 0.2);
    }
</style>
