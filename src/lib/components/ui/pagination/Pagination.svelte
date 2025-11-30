<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { Button } from '$lib/components/ui/button';
    import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-svelte';

    export let currentPage: number = 1;
    export let totalPages: number = 1;
    export let totalItems: number = 0;
    export let itemsPerPage: number = 12;
    export let showFirstLast: boolean = true;
    export let maxVisiblePages: number = 5;

    const dispatch = createEventDispatcher<{
        pageChange: { page: number };
    }>();

    $: startItem = (currentPage - 1) * itemsPerPage + 1;
    $: endItem = Math.min(currentPage * itemsPerPage, totalItems);

    $: visiblePages = (() => {
        const pages: number[] = [];
        let start = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let end = Math.min(totalPages, start + maxVisiblePages - 1);
        
        if (end - start + 1 < maxVisiblePages) {
            start = Math.max(1, end - maxVisiblePages + 1);
        }
        
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    })();

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages && page !== currentPage) {
            currentPage = page;
            dispatch('pageChange', { page });
        }
    }

    function handleKeydown(event: KeyboardEvent, page: number) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            goToPage(page);
        }
    }
</script>

{#if totalPages > 1}
    <nav 
        class="pagination-container"
        aria-label="Pagination navigation"
        role="navigation"
    >
        <div class="pagination-info" aria-live="polite" aria-atomic="true">
            <span class="sr-only">Showing </span>
            <span class="pagination-range">{startItem}-{endItem}</span>
            <span class="pagination-separator"> of </span>
            <span class="pagination-total">{totalItems}</span>
            <span class="sr-only"> items</span>
        </div>

        <div class="pagination-controls" role="group" aria-label="Page navigation">
            {#if showFirstLast}
                <Button
                    variant="outline"
                    size="icon"
                    class="pagination-button"
                    disabled={currentPage === 1}
                    on:click={() => goToPage(1)}
                    on:keydown={(e) => handleKeydown(e, 1)}
                    aria-label="Go to first page"
                    aria-disabled={currentPage === 1}
                >
                    <ChevronsLeft class="h-4 w-4" aria-hidden="true" />
                </Button>
            {/if}

            <Button
                variant="outline"
                size="icon"
                class="pagination-button"
                disabled={currentPage === 1}
                on:click={() => goToPage(currentPage - 1)}
                on:keydown={(e) => handleKeydown(e, currentPage - 1)}
                aria-label="Go to previous page"
                aria-disabled={currentPage === 1}
            >
                <ChevronLeft class="h-4 w-4" aria-hidden="true" />
            </Button>

            <div class="pagination-pages" role="group" aria-label="Page numbers">
                {#if visiblePages[0] > 1}
                    <Button
                        variant="outline"
                        size="icon"
                        class="pagination-page"
                        on:click={() => goToPage(1)}
                        on:keydown={(e) => handleKeydown(e, 1)}
                        aria-label="Go to page 1"
                    >
                        1
                    </Button>
                    {#if visiblePages[0] > 2}
                        <span class="pagination-ellipsis" aria-hidden="true">...</span>
                    {/if}
                {/if}

                {#each visiblePages as page}
                    <Button
                        variant={page === currentPage ? "default" : "outline"}
                        size="icon"
                        class="pagination-page {page === currentPage ? 'active' : ''}"
                        on:click={() => goToPage(page)}
                        on:keydown={(e) => handleKeydown(e, page)}
                        aria-label={page === currentPage ? `Current page, page ${page}` : `Go to page ${page}`}
                        aria-current={page === currentPage ? 'page' : undefined}
                    >
                        {page}
                    </Button>
                {/each}

                {#if visiblePages[visiblePages.length - 1] < totalPages}
                    {#if visiblePages[visiblePages.length - 1] < totalPages - 1}
                        <span class="pagination-ellipsis" aria-hidden="true">...</span>
                    {/if}
                    <Button
                        variant="outline"
                        size="icon"
                        class="pagination-page"
                        on:click={() => goToPage(totalPages)}
                        on:keydown={(e) => handleKeydown(e, totalPages)}
                        aria-label="Go to page {totalPages}"
                    >
                        {totalPages}
                    </Button>
                {/if}
            </div>

            <Button
                variant="outline"
                size="icon"
                class="pagination-button"
                disabled={currentPage === totalPages}
                on:click={() => goToPage(currentPage + 1)}
                on:keydown={(e) => handleKeydown(e, currentPage + 1)}
                aria-label="Go to next page"
                aria-disabled={currentPage === totalPages}
            >
                <ChevronRight class="h-4 w-4" aria-hidden="true" />
            </Button>

            {#if showFirstLast}
                <Button
                    variant="outline"
                    size="icon"
                    class="pagination-button"
                    disabled={currentPage === totalPages}
                    on:click={() => goToPage(totalPages)}
                    on:keydown={(e) => handleKeydown(e, totalPages)}
                    aria-label="Go to last page"
                    aria-disabled={currentPage === totalPages}
                >
                    <ChevronsRight class="h-4 w-4" aria-hidden="true" />
                </Button>
            {/if}
        </div>
    </nav>
{/if}

<style>
    .pagination-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem 0;
        width: 100%;
    }

    @media (min-width: 640px) {
        .pagination-container {
            flex-direction: row;
            justify-content: space-between;
        }
    }

    .pagination-info {
        font-size: 0.875rem;
        color: var(--muted-foreground, #888);
        font-weight: 500;
    }

    .pagination-range {
        color: var(--foreground, #fff);
        font-weight: 600;
    }

    .pagination-total {
        color: var(--foreground, #fff);
        font-weight: 600;
    }

    .pagination-controls {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .pagination-pages {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin: 0 0.5rem;
    }

    .pagination-ellipsis {
        padding: 0 0.5rem;
        color: var(--muted-foreground, #888);
        user-select: none;
    }

    :global(.pagination-button) {
        border-color: rgba(255, 165, 0, 0.2) !important;
        transition: all 0.2s ease !important;
    }

    :global(.pagination-button:hover:not(:disabled)) {
        border-color: rgba(255, 165, 0, 0.4) !important;
        background-color: rgba(255, 165, 0, 0.1) !important;
    }

    :global(.pagination-button:focus-visible) {
        outline: 2px solid orange !important;
        outline-offset: 2px !important;
    }

    :global(.pagination-page) {
        min-width: 2.5rem !important;
        border-color: rgba(255, 165, 0, 0.2) !important;
        transition: all 0.2s ease !important;
    }

    :global(.pagination-page:hover:not(:disabled)) {
        border-color: rgba(255, 165, 0, 0.4) !important;
        background-color: rgba(255, 165, 0, 0.1) !important;
    }

    :global(.pagination-page.active) {
        background-color: orange !important;
        color: black !important;
        border-color: orange !important;
        font-weight: 700 !important;
    }

    :global(.pagination-page:focus-visible) {
        outline: 2px solid orange !important;
        outline-offset: 2px !important;
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    @media (max-width: 480px) {
        .pagination-pages {
            display: none;
        }

        .pagination-info {
            text-align: center;
        }
    }
</style>
