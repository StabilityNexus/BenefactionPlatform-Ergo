<script lang="ts">
    export let title: string = '';
    export let description: string = '';
    export let spacing: 'sm' | 'md' | 'lg' = 'md';
    export let ariaLabel: string = '';

    const spacingClasses = {
        sm: 'mb-6 sm:mb-8',
        md: 'mb-8 sm:mb-12',
        lg: 'mb-12 sm:mb-16'
    };
</script>

<section
    class="section {spacingClasses[spacing]}"
    aria-label={ariaLabel || title || undefined}
>
    {#if title || description}
        <header class="section-header">
            {#if title}
                <h2 class="section-title">
                    {title}
                </h2>
            {/if}
            {#if description}
                <p class="section-description">
                    {description}
                </p>
            {/if}
        </header>
    {/if}
    
    <div class="section-content">
        <slot />
    </div>
</section>

<style>
    .section {
        width: 100%;
    }

    .section-header {
        text-align: center;
        margin-bottom: 2rem;
    }

    .section-title {
        font-size: 2rem;
        font-weight: 700;
        color: orange;
        font-family: 'Russo One', sans-serif;
        letter-spacing: 0.02em;
        margin: 0 0 0.5rem 0;
        position: relative;
        display: inline-block;
    }

    .section-title::after {
        content: '';
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 80px;
        height: 3px;
        background: linear-gradient(90deg, transparent, orange, transparent);
        border-radius: 2px;
    }

    .section-description {
        color: var(--muted-foreground, #888);
        font-size: 1rem;
        margin: 1rem 0 0 0;
        max-width: 600px;
        margin-left: auto;
        margin-right: auto;
        line-height: 1.6;
    }

    .section-content {
        width: 100%;
    }

    @media (max-width: 640px) {
        .section-title {
            font-size: 1.5rem;
        }

        .section-description {
            font-size: 0.875rem;
        }

        .section-header {
            margin-bottom: 1.5rem;
        }
    }
</style>
