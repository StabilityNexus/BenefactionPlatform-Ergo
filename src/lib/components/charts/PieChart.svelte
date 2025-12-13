<script lang="ts">
    import { onMount } from "svelte";
    
    export let data: Array<{ label: string; value: number; color?: string }>;
    export let width: number = 300;
    export let height: number = 300;
    export let showLegend: boolean = true;
    export let title: string = "";
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    
    const defaultColors = [
        "#3b82f6", // blue
        "#10b981", // green
        "#f59e0b", // amber
        "#ef4444", // red
        "#8b5cf6", // purple
        "#ec4899", // pink
        "#06b6d4", // cyan
        "#f97316", // orange
    ];
    
    onMount(() => {
        ctx = canvas.getContext("2d");
        drawChart();
    });
    
    $: if (canvas && data) {
        drawChart();
    }
    
    function drawChart() {
        if (!ctx || !data || data.length === 0) return;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) return;
        
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 20;
        
        let startAngle = -Math.PI / 2;
        
        data.forEach((item, index) => {
            const sliceAngle = (item.value / total) * 2 * Math.PI;
            const endAngle = startAngle + sliceAngle;
            
            const color = item.color || defaultColors[index % defaultColors.length];
            
            // Draw slice
            ctx!.beginPath();
            ctx!.moveTo(centerX, centerY);
            ctx!.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx!.closePath();
            ctx!.fillStyle = color;
            ctx!.fill();
            
            // Draw border
            ctx!.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx!.lineWidth = 2;
            ctx!.stroke();
            
            // Draw percentage label
            if (item.value / total > 0.05) { // Only show label if > 5%
                const labelAngle = startAngle + sliceAngle / 2;
                const labelRadius = radius * 0.7;
                const labelX = centerX + labelRadius * Math.cos(labelAngle);
                const labelY = centerY + labelRadius * Math.sin(labelAngle);
                
                ctx!.fillStyle = "#ffffff";
                ctx!.font = "bold 14px sans-serif";
                ctx!.textAlign = "center";
                ctx!.textBaseline = "middle";
                ctx!.fillText(`${Math.round((item.value / total) * 100)}%`, labelX, labelY);
            }
            
            startAngle = endAngle;
        });
    }
</script>

<div class="chart-container">
    {#if title}
        <h3 class="chart-title">{title}</h3>
    {/if}
    
    <canvas bind:this={canvas} {width} {height}></canvas>
    
    {#if showLegend && data.length > 0}
        <div class="legend">
            {#each data as item, index}
                <div class="legend-item">
                    <span 
                        class="legend-color" 
                        style="background-color: {item.color || defaultColors[index % defaultColors.length]}"
                    ></span>
                    <span class="legend-label">{item.label}: {item.value.toFixed(2)}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .chart-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
    }
    
    .chart-title {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0;
    }
    
    canvas {
        border-radius: 0.5rem;
    }
    
    .legend {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
        max-width: 300px;
    }
    
    .legend-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
    }
    
    .legend-color {
        width: 1rem;
        height: 1rem;
        border-radius: 0.25rem;
        flex-shrink: 0;
    }
    
    .legend-label {
        flex: 1;
    }
</style>
