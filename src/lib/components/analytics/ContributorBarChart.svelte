<script lang="ts">
    import type { ContributorData } from "$lib/analytics/metrics-collector";
    import { generateBarChartSVG } from "$lib/analytics/chart-components";

    export let contributors: ContributorData[] = [];
    export let width: number = 600;
    export let height: number = 300;
    export let color: string = "#8b5cf6";

    let svgContent = "";

    $: {
        const topContributors = [...contributors]
            .sort((a, b) => b.contributionAmount - a.contributionAmount)
            .slice(0, 10)
            .map(c => ({
                label: c.address.slice(0, 8) + "...",
                value: c.contributionAmount
            }));

        if (topContributors.length > 0) {
            svgContent = generateBarChartSVG(topContributors, {
                width,
                height,
                color,
                showGrid: true
            });
        } else {
            svgContent = `<svg width="${width}" height="${height}"><text x="${width/2}" y="${height/2}" text-anchor="middle" fill="#6b7280">No contributor data available</text></svg>`;
        }
    }
</script>

<div class="chart-container">
    <div class="chart-header">
        <h3>Top Contributors</h3>
        <p class="chart-subtitle">Top 10 contributors by amount</p>
    </div>
    <div class="chart-wrapper" style="width: {width}px; height: {height}px;">
        {@html svgContent}
    </div>
</div>

<style>
    .chart-container {
        background: var(--background);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .chart-header {
        margin-bottom: 1rem;
    }

    .chart-header h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--foreground);
    }

    .chart-subtitle {
        margin: 0;
        font-size: 0.875rem;
        color: var(--muted-foreground);
    }

    .chart-wrapper {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .chart-wrapper :global(svg) {
        max-width: 100%;
        height: auto;
    }
</style>


