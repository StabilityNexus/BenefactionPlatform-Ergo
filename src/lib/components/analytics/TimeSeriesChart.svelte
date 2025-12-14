<script lang="ts">
    import { onMount } from 'svelte';
    import type { TimeSeriesData } from '$lib/analytics/datacollector';
    import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { fade } from 'svelte/transition';

    export let data: TimeSeriesData[] = [];
    export let metric: 'totalRaised' | 'activeProjects' | 'newProjects' | 'totalContributors' = 'totalRaised';
    export let title = "Trend Analysis";

    let chartContainer: HTMLDivElement;
    let hoveredPoint: number | null = null;
    let chartWidth = 0;
    let chartHeight = 300;

    $: if (chartContainer) {
        chartWidth = chartContainer.clientWidth;
    }

    $: chartData = data.slice(-30); // Last 30 days
    $: maxValue = Math.max(...chartData.map(d => d[metric]), 1);
    $: minValue = Math.min(...chartData.map(d => d[metric]), 0);
    $: valueRange = maxValue - minValue || 1;

    $: points = chartData.map((d, i) => ({
        x: (i / (chartData.length - 1 || 1)) * chartWidth,
        y: chartHeight - ((d[metric] - minValue) / valueRange) * (chartHeight - 40),
        value: d[metric],
        date: d.date,
    }));

    $: pathD = points.length > 0 
        ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}` 
        : '';

    $: areaPathD = points.length > 0
        ? `${pathD} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`
        : '';

    function formatValue(value: number): string {
        if (metric === 'totalRaised') {
            return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toFixed(0);
        }
        return value.toFixed(0);
    }

    function getMetricLabel(): string {
        const labels = {
            totalRaised: 'Total Raised (ERG)',
            activeProjects: 'Active Projects',
            newProjects: 'New Projects',
            totalContributors: 'Total Contributors',
        };
        return labels[metric];
    }

    onMount(() => {
        const resizeObserver = new ResizeObserver(() => {
            if (chartContainer) {
                chartWidth = chartContainer.clientWidth;
            }
        });
        
        if (chartContainer) {
            resizeObserver.observe(chartContainer);
        }

        return () => resizeObserver.disconnect();
    });
</script>

<Card class="w-full">
    <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p class="text-sm text-muted-foreground">{getMetricLabel()}</p>
    </CardHeader>
    <CardContent>
        {#if chartData.length === 0}
            <div class="flex items-center justify-center h-64 text-muted-foreground">
                No data available
            </div>
        {:else}
            <div class="relative" bind:this={chartContainer} style="height: {chartHeight}px;">
                <svg width="100%" height="100%" class="overflow-visible">
                    <!-- Grid lines -->
                    {#each [0, 0.25, 0.5, 0.75, 1] as tick}
                        <line
                            x1="0"
                            y1="{chartHeight - (tick * (chartHeight - 40))}"
                            x2="{chartWidth}"
                            y2="{chartHeight - (tick * (chartHeight - 40))}"
                            stroke="hsl(var(--muted))"
                            stroke-width="1"
                            stroke-dasharray="4"
                        />
                        <text
                            x="5"
                            y="{chartHeight - (tick * (chartHeight - 40)) - 5}"
                            class="text-xs fill-muted-foreground"
                        >
                            {formatValue(minValue + (tick * valueRange))}
                        </text>
                    {/each}

                    <!-- Area gradient -->
                    <defs>
                        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:hsl(var(--primary));stop-opacity:0.3" />
                            <stop offset="100%" style="stop-color:hsl(var(--primary));stop-opacity:0.05" />
                        </linearGradient>
                    </defs>

                    <!-- Area under curve -->
                    <path
                        d={areaPathD}
                        fill="url(#areaGradient)"
                        transition:fade
                    />

                    <!-- Line -->
                    <path
                        d={pathD}
                        fill="none"
                        stroke="hsl(var(--primary))"
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        transition:fade
                    />

                    <!-- Data points -->
                    {#each points as point, index}
                        <circle
                            cx={point.x}
                            cy={point.y}
                            r={hoveredPoint === index ? 6 : 4}
                            fill="hsl(var(--primary))"
                            stroke="hsl(var(--background))"
                            stroke-width="2"
                            class="cursor-pointer transition-all"
                            on:mouseenter={() => hoveredPoint = index}
                            on:mouseleave={() => hoveredPoint = null}
                            role="button"
                            tabindex="0"
                        />
                    {/each}
                </svg>

                <!-- Tooltip -->
                {#if hoveredPoint !== null && points[hoveredPoint]}
                    <div 
                        class="absolute bg-popover border rounded-lg shadow-lg p-2 pointer-events-none"
                        style="left: {points[hoveredPoint].x}px; top: {points[hoveredPoint].y - 60}px; transform: translateX(-50%);"
                        transition:fade={{ duration: 150 }}
                    >
                        <div class="text-xs space-y-1">
                            <p class="font-semibold">{points[hoveredPoint].date}</p>
                            <p>{getMetricLabel()}: {formatValue(points[hoveredPoint].value)}</p>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </CardContent>
</Card>