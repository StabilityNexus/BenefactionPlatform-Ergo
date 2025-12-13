<script lang="ts">
    import type { TimeSeriesDataPoint } from "$lib/analytics/metrics-collector";
    import { generateLineChartSVG } from "$lib/analytics/chart-components";
    import { onMount } from "svelte";

    export let data: TimeSeriesDataPoint[] = [];
    export let width: number = 600;
    export let height: number = 300;
    export let color: string = "#3b82f6";

    let svgContent = "";

    $: {
        if (data.length > 0) {
            svgContent = generateLineChartSVG(data, {
                width,
                height,
                color,
                showGrid: true,
                showPoints: true
            });
        } else {
            svgContent = `<svg width="${width}" height="${height}"><text x="${width/2}" y="${height/2}" text-anchor="middle" fill="#6b7280">No data available</text></svg>`;
        }
    }
</script>

<div class="chart-container">
    <div class="chart-header">
        <h3>Funding Progress Over Time</h3>
        <p class="chart-subtitle">Percentage of funding goal reached</p>
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


