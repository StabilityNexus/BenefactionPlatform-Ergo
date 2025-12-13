<script lang="ts">
    import { onMount } from "svelte";
    
    export let data: Array<{ label: string; value: number; color?: string }>;
    export let width: number = 600;
    export let height: number = 400;
    export let title: string = "";
    export let xAxisLabel: string = "";
    export let yAxisLabel: string = "";
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    
    const padding = { top: 40, right: 40, bottom: 80, left: 70 };
    const defaultColor = "#3b82f6";
    
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
        
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        const maxValue = Math.max(...data.map(d => d.value));
        const barWidth = chartWidth / data.length - 10;
        const barSpacing = 10;
        
        // Draw background
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);
        
        // Draw grid lines
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        
        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const y = padding.top + (chartHeight / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            
            // Y-axis labels
            const value = maxValue - (maxValue / gridLines) * i;
            ctx.fillStyle = "#888";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(value.toFixed(0), padding.left - 10, y);
        }
        
        // Draw bars
        data.forEach((item, index) => {
            const x = padding.left + (chartWidth / data.length) * index + barSpacing / 2;
            const barHeight = (item.value / maxValue) * chartHeight;
            const y = padding.top + chartHeight - barHeight;
            
            const color = item.color || defaultColor;
            
            // Draw bar with gradient
            const gradient = ctx!.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, color + "aa");
            
            ctx!.fillStyle = gradient;
            ctx!.fillRect(x, y, barWidth, barHeight);
            
            // Draw border
            ctx!.strokeStyle = color;
            ctx!.lineWidth = 2;
            ctx!.strokeRect(x, y, barWidth, barHeight);
            
            // Draw value on top of bar
            ctx!.fillStyle = "#333";
            ctx!.font = "bold 12px sans-serif";
            ctx!.textAlign = "center";
            ctx!.textBaseline = "bottom";
            ctx!.fillText(item.value.toFixed(0), x + barWidth / 2, y - 5);
        });
        
        // Draw X-axis labels
        ctx.fillStyle = "#888";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        data.forEach((item, index) => {
            const x = padding.left + (chartWidth / data.length) * index + barSpacing / 2 + barWidth / 2;
            const y = padding.top + chartHeight + 10;
            
            // Rotate labels if they're long
            if (item.label.length > 8) {
                ctx!.save();
                ctx!.translate(x, y);
                ctx!.rotate(-Math.PI / 4);
                ctx!.textAlign = "right";
                ctx!.fillText(item.label, 0, 0);
                ctx!.restore();
            } else {
                ctx!.fillText(item.label, x, y);
            }
        });
        
        // Draw axis labels
        if (xAxisLabel) {
            ctx.fillStyle = "#666";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(xAxisLabel, padding.left + chartWidth / 2, height - 20);
        }
        
        if (yAxisLabel) {
            ctx.save();
            ctx.translate(20, padding.top + chartHeight / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = "#666";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(yAxisLabel, 0, 0);
            ctx.restore();
        }
        
        // Draw title
        if (title) {
            ctx.fillStyle = "#333";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(title, width / 2, 20);
        }
    }
</script>

<div class="chart-container">
    <canvas bind:this={canvas} {width} {height}></canvas>
</div>

<style>
    .chart-container {
        display: flex;
        justify-content: center;
        padding: 1rem;
    }
    
    canvas {
        border-radius: 0.5rem;
    }
</style>
