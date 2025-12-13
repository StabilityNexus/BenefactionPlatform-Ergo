<script lang="ts">
    import type { TimeSeriesDataPoint } from "$lib/analytics/metrics";
    
    export let data: TimeSeriesDataPoint[] = [];
    export let title: string = "Chart";
    export let height: number = 300;
    export let color: string = "#4F46E5"; // Indigo
    export let showGrid: boolean = true;
    export let showLabels: boolean = true;
    export let type: "line" | "bar" | "area" = "line";
    
    $: maxValue = Math.max(...data.map(d => d.value), 1);
    $: minValue = Math.min(...data.map(d => d.value), 0);
    $: valueRange = maxValue - minValue || 1;
    $: chartWidth = 800;
    $: chartHeight = height - 60; // Account for labels and title
    $: leftPadding = 60;
    $: bottomPadding = 40;
    $: rightPadding = 20;
    $: topPadding = 10;
    $: plotWidth = chartWidth - leftPadding - rightPadding;
    $: plotHeight = chartHeight - topPadding - bottomPadding;
    
    function getX(index: number): number {
        if (data.length <= 1) return leftPadding;
        return leftPadding + (index / (data.length - 1)) * plotWidth;
    }
    
    function getY(value: number): number {
        const normalized = (value - minValue) / valueRange;
        return topPadding + plotHeight - (normalized * plotHeight);
    }
    
    function formatValue(value: number): string {
        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(1)}M`;
        } else if (value >= 1_000) {
            return `${(value / 1_000).toFixed(1)}K`;
        }
        return value.toFixed(0);
    }
    
    function generatePath(): string {
        if (data.length === 0) return "";
        
        if (type === "area") {
            const points = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(" L ");
            const baseline = getY(minValue);
            return `M ${getX(0)},${baseline} L ${points} L ${getX(data.length - 1)},${baseline} Z`;
        } else {
            return data.map((d, i) => {
                const x = getX(i);
                const y = getY(d.value);
                return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
            }).join(" ");
        }
    }
    
    // Generate Y-axis grid lines and labels
    $: yAxisTicks = (() => {
        const ticks = [];
        const tickCount = 5;
        for (let i = 0; i <= tickCount; i++) {
            const value = minValue + (valueRange * i / tickCount);
            const y = getY(value);
            ticks.push({ value, y });
        }
        return ticks;
    })();
</script>

<div class="chart-container">
    <h3 class="chart-title">{title}</h3>
    
    <svg 
        width={chartWidth} 
        height={chartHeight}
        class="chart-svg"
    >
        <!-- Grid lines -->
        {#if showGrid}
            {#each yAxisTicks as tick}
                <line
                    x1={leftPadding}
                    y1={tick.y}
                    x2={chartWidth - rightPadding}
                    y2={tick.y}
                    stroke="#e5e7eb"
                    stroke-width="1"
                    stroke-dasharray="4 4"
                />
            {/each}
        {/if}
        
        <!-- Y-axis labels -->
        {#if showLabels}
            {#each yAxisTicks as tick}
                <text
                    x={leftPadding - 10}
                    y={tick.y}
                    text-anchor="end"
                    dominant-baseline="middle"
                    class="axis-label"
                >
                    {formatValue(tick.value)}
                </text>
            {/each}
        {/if}
        
        <!-- Chart content -->
        {#if type === "bar"}
            {#each data as point, i}
                <rect
                    x={getX(i) - (plotWidth / data.length / 2) + 5}
                    y={getY(point.value)}
                    width={(plotWidth / data.length) - 10}
                    height={getY(minValue) - getY(point.value)}
                    fill={color}
                    opacity="0.8"
                />
            {/each}
        {:else if type === "area"}
            <path
                d={generatePath()}
                fill={color}
                opacity="0.3"
            />
            <path
                d={data.map((d, i) => {
                    const x = getX(i);
                    const y = getY(d.value);
                    return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke={color}
                stroke-width="2"
            />
        {:else}
            <!-- Line chart -->
            <path
                d={generatePath()}
                fill="none"
                stroke={color}
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
            
            <!-- Data points -->
            {#each data as point, i}
                <circle
                    cx={getX(i)}
                    cy={getY(point.value)}
                    r="4"
                    fill={color}
                />
            {/each}
        {/if}
        
        <!-- X-axis labels -->
        {#if showLabels && data.length > 0}
            {#each data.filter((_, i) => i % Math.ceil(data.length / 5) === 0) as point, i}
                {@const index = data.indexOf(point)}
                <text
                    x={getX(index)}
                    y={chartHeight - bottomPadding + 20}
                    text-anchor="middle"
                    class="axis-label"
                >
                    {point.label || ""}
                </text>
            {/each}
        {/if}
        
        <!-- Axes -->
        <line
            x1={leftPadding}
            y1={topPadding}
            x2={leftPadding}
            y2={chartHeight - bottomPadding}
            stroke="#6b7280"
            stroke-width="2"
        />
        <line
            x1={leftPadding}
            y1={chartHeight - bottomPadding}
            x2={chartWidth - rightPadding}
            y2={chartHeight - bottomPadding}
            stroke="#6b7280"
            stroke-width="2"
        />
    </svg>
</div>

<style>
    .chart-container {
        padding: 1rem;
        background: white;
        border-radius: 0.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    
    :global(.dark) .chart-container {
        background: #1f2937;
    }
    
    .chart-title {
        font-size: 1.125rem;
        font-weight: 600;
        margin-bottom: 1rem;
        color: #111827;
    }
    
    :global(.dark) .chart-title {
        color: #f9fafb;
    }
    
    .chart-svg {
        overflow: visible;
    }
    
    .axis-label {
        font-size: 12px;
        fill: #6b7280;
    }
    
    :global(.dark) .axis-label {
        fill: #9ca3af;
    }
</style>
