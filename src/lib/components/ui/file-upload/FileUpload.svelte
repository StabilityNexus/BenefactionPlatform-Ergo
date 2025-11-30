<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Upload, X, Link, Image as ImageIcon, AlertCircle } from 'lucide-svelte';

    export let value: string = '';
    export let label: string = 'Image';
    export let accept: string = 'image/*';
    export let maxSizeKB: number = 500;
    export let placeholder: string = 'Enter image URL or upload a file';
    export let disabled: boolean = false;

    const dispatch = createEventDispatcher<{
        change: { value: string; type: 'url' | 'file' };
        input: { value: string };
    }>();

    function updateValue(newValue: string, type: 'url' | 'file') {
        value = newValue;
        dispatch('input', { value: newValue });
        dispatch('change', { value: newValue, type });
    }

    let inputMode: 'url' | 'file' = 'url';
    let fileInput: HTMLInputElement;
    let dragActive = false;
    let previewUrl: string = '';
    let errorMessage: string = '';
    let isLoading = false;

    $: if (value && value.startsWith('http')) {
        previewUrl = value;
        inputMode = 'url';
    } else if (value && value.startsWith('data:')) {
        previewUrl = value;
        inputMode = 'file';
    }

    function switchMode(mode: 'url' | 'file') {
        inputMode = mode;
        errorMessage = '';
        if (mode === 'file' && value.startsWith('http')) {
            previewUrl = '';
        }
    }

    function handleUrlInput(event: Event) {
        const target = event.target as HTMLInputElement;
        previewUrl = target.value;
        errorMessage = '';
        updateValue(target.value, 'url');
    }

    function handleFileSelect(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            processFile(file);
        }
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        dragActive = false;
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            processFile(file);
        }
    }

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        dragActive = true;
    }

    function handleDragLeave(event: DragEvent) {
        event.preventDefault();
        dragActive = false;
    }

    async function processFile(file: File) {
        errorMessage = '';
        isLoading = true;

        if (!file.type.startsWith('image/')) {
            errorMessage = 'Please upload an image file (JPEG, PNG, GIF, WebP)';
            isLoading = false;
            return;
        }

        const fileSizeKB = file.size / 1024;
        if (fileSizeKB > maxSizeKB) {
            errorMessage = `File size (${fileSizeKB.toFixed(1)}KB) exceeds maximum of ${maxSizeKB}KB. Please use a smaller image or provide a URL instead.`;
            isLoading = false;
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            previewUrl = base64;
            updateValue(base64, 'file');
        } catch (error) {
            errorMessage = 'Failed to process the image. Please try again.';
        } finally {
            isLoading = false;
        }
    }

    function fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error('Failed to read file'));
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    function clearValue() {
        previewUrl = '';
        errorMessage = '';
        if (fileInput) {
            fileInput.value = '';
        }
        updateValue('', inputMode);
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput?.click();
        }
    }
</script>

<div class="file-upload-container">
    <Label class="file-upload-label" id="file-upload-label">
        {label}
    </Label>

    <div class="mode-toggle" role="tablist" aria-label="Image input method">
        <button
            type="button"
            class="mode-button {inputMode === 'url' ? 'active' : ''}"
            on:click={() => switchMode('url')}
            role="tab"
            aria-selected={inputMode === 'url'}
            aria-controls="url-input-panel"
            {disabled}
        >
            <Link class="h-4 w-4" aria-hidden="true" />
            <span>URL</span>
        </button>
        <button
            type="button"
            class="mode-button {inputMode === 'file' ? 'active' : ''}"
            on:click={() => switchMode('file')}
            role="tab"
            aria-selected={inputMode === 'file'}
            aria-controls="file-input-panel"
            {disabled}
        >
            <Upload class="h-4 w-4" aria-hidden="true" />
            <span>Upload</span>
        </button>
    </div>

    {#if inputMode === 'url'}
        <div id="url-input-panel" role="tabpanel" aria-labelledby="file-upload-label">
            <Input
                type="url"
                {placeholder}
                value={value.startsWith('http') ? value : ''}
                on:input={handleUrlInput}
                {disabled}
                class="file-upload-input"
                aria-describedby={errorMessage ? 'error-message' : undefined}
            />
        </div>
    {:else}
        <div 
            id="file-input-panel" 
            role="tabpanel" 
            aria-labelledby="file-upload-label"
            class="drop-zone {dragActive ? 'drag-active' : ''} {disabled ? 'disabled' : ''}"
            on:drop={handleDrop}
            on:dragover={handleDragOver}
            on:dragleave={handleDragLeave}
            on:click={() => !disabled && fileInput?.click()}
            on:keydown={handleKeydown}
            tabindex={disabled ? -1 : 0}
            aria-label="Click or drag to upload an image"
        >
            <input
                type="file"
                bind:this={fileInput}
                {accept}
                on:change={handleFileSelect}
                {disabled}
                class="hidden-input"
                aria-hidden="true"
                tabindex="-1"
            />
            
            {#if isLoading}
                <div class="drop-zone-content">
                    <div class="loading-spinner" aria-label="Processing image"></div>
                    <p class="drop-zone-text">Processing image...</p>
                </div>
            {:else}
                <div class="drop-zone-content">
                    <Upload class="drop-zone-icon" aria-hidden="true" />
                    <p class="drop-zone-text">
                        Drag & drop an image here, or click to browse
                    </p>
                    <p class="drop-zone-hint">
                        Maximum size: {maxSizeKB}KB. Supported: JPEG, PNG, GIF, WebP
                    </p>
                </div>
            {/if}
        </div>
    {/if}

    {#if errorMessage}
        <div class="error-message" id="error-message" role="alert">
            <AlertCircle class="h-4 w-4" aria-hidden="true" />
            <span>{errorMessage}</span>
        </div>
    {/if}

    {#if previewUrl}
        <div class="preview-container">
            <div class="preview-header">
                <span class="preview-label">
                    <ImageIcon class="h-4 w-4" aria-hidden="true" />
                    Preview
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    class="preview-clear"
                    on:click={clearValue}
                    aria-label="Remove image"
                    {disabled}
                >
                    <X class="h-4 w-4" aria-hidden="true" />
                </Button>
            </div>
            <div class="preview-image-wrapper">
                <img 
                    src={previewUrl} 
                    alt="Image preview" 
                    class="preview-image"
                    on:error={() => {
                        errorMessage = 'Failed to load image. Please check the URL.';
                        previewUrl = '';
                    }}
                />
            </div>
        </div>
    {/if}
</div>

<style>
    .file-upload-container {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        width: 100%;
    }

    :global(.file-upload-label) {
        font-weight: 600;
        color: var(--foreground);
    }

    .mode-toggle {
        display: flex;
        gap: 0.5rem;
        padding: 0.25rem;
        background: rgba(255, 165, 0, 0.05);
        border-radius: 0.5rem;
        border: 1px solid rgba(255, 165, 0, 0.1);
    }

    .mode-button {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border: none;
        background: transparent;
        color: var(--muted-foreground);
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 0.375rem;
        cursor: pointer;
        transition: all 0.2s ease;
        flex: 1;
        justify-content: center;
    }

    .mode-button:hover:not(:disabled) {
        background: rgba(255, 165, 0, 0.1);
        color: orange;
    }

    .mode-button.active {
        background: orange;
        color: black;
        font-weight: 600;
    }

    .mode-button:focus-visible {
        outline: 2px solid orange;
        outline-offset: 2px;
    }

    .mode-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    :global(.file-upload-input) {
        border-color: rgba(255, 165, 0, 0.2) !important;
    }

    :global(.file-upload-input:focus) {
        border-color: orange !important;
        box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.2) !important;
    }

    .drop-zone {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        border: 2px dashed rgba(255, 165, 0, 0.3);
        border-radius: 0.75rem;
        background: rgba(255, 165, 0, 0.02);
        cursor: pointer;
        transition: all 0.2s ease;
        min-height: 150px;
    }

    .drop-zone:hover:not(.disabled) {
        border-color: rgba(255, 165, 0, 0.5);
        background: rgba(255, 165, 0, 0.05);
    }

    .drop-zone.drag-active {
        border-color: orange;
        background: rgba(255, 165, 0, 0.1);
        border-style: solid;
    }

    .drop-zone:focus-visible {
        outline: 2px solid orange;
        outline-offset: 2px;
    }

    .drop-zone.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .hidden-input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
    }

    .drop-zone-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        text-align: center;
    }

    :global(.drop-zone-icon) {
        width: 3rem;
        height: 3rem;
        color: rgba(255, 165, 0, 0.5);
    }

    .drop-zone-text {
        font-size: 0.875rem;
        color: var(--foreground);
        font-weight: 500;
        margin: 0;
    }

    .drop-zone-hint {
        font-size: 0.75rem;
        color: var(--muted-foreground);
        margin: 0;
    }

    .loading-spinner {
        width: 2rem;
        height: 2rem;
        border: 3px solid rgba(255, 165, 0, 0.2);
        border-top-color: orange;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .error-message {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 0.5rem;
        color: #ef4444;
        font-size: 0.875rem;
    }

    .preview-container {
        border: 1px solid rgba(255, 165, 0, 0.2);
        border-radius: 0.75rem;
        overflow: hidden;
        background: rgba(255, 165, 0, 0.02);
    }

    .preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        background: rgba(255, 165, 0, 0.05);
        border-bottom: 1px solid rgba(255, 165, 0, 0.1);
    }

    .preview-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--foreground);
    }

    :global(.preview-clear) {
        color: var(--muted-foreground);
    }

    :global(.preview-clear:hover) {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1) !important;
    }

    .preview-image-wrapper {
        padding: 1rem;
        display: flex;
        justify-content: center;
        align-items: center;
        max-height: 300px;
        overflow: hidden;
    }

    .preview-image {
        max-width: 100%;
        max-height: 250px;
        object-fit: contain;
        border-radius: 0.5rem;
    }

    @media (max-width: 640px) {
        .drop-zone {
            padding: 1.5rem;
            min-height: 120px;
        }

        :global(.drop-zone-icon) {
            width: 2rem;
            height: 2rem;
        }

        .drop-zone-text {
            font-size: 0.8rem;
        }

        .preview-image-wrapper {
            max-height: 200px;
        }

        .preview-image {
            max-height: 180px;
        }
    }
</style>
