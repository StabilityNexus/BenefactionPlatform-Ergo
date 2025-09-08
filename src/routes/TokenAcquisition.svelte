<script lang="ts">
    import ProjectList from './ProjectList.svelte';
    import { onMount } from 'svelte';
    import { invalidateAllCaches } from '$lib/ergo/cache';
    import { type Project} from "$lib/common/project";

    // Clear stale caches on mount if needed
    onMount(() => {
        // Check if we need to clear caches due to stale data
        const lastCacheClear = localStorage.getItem('last_cache_clear');
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        
        if (!lastCacheClear || now - parseInt(lastCacheClear) > ONE_HOUR) {
            console.log('Clearing stale caches...');
            invalidateAllCaches();
            localStorage.setItem('last_cache_clear', now.toString());
        }
    });

    async function projectFilter(project: Project) {
        return true  
    }
</script>
<ProjectList filterProject={projectFilter}>
    Fundraising Projects
</ProjectList>